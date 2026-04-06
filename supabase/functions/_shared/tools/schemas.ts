import { z } from "npm:zod@4";

// ── Shared strict primitives (execute_v3 Phase 6 Step 6A) ────────────────────

/** Resolved tenant key (`photographers.id` and FK targets). */
export const TenantPhotographerIdSchema = z.uuid();

/** Non-empty after trim — rejects whitespace-only payloads. */
export const StrictNonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, { message: "must not be empty or whitespace-only" });

/**
 * ISO date or instant string that `Date.parse` accepts (no silent Invalid Date).
 */
export const ParseableInstantStringSchema = z
  .string()
  .trim()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "must be a parseable ISO date or datetime string",
  });

/**
 * Structured decision justification for risky or gated tool calls (execute_v3 Step 6C).
 * Wire-up to individual tools comes in later steps; schema is defined here for strict contracts.
 */
export const DecisionJustificationSchema = z
  .object({
    why_blocked: StrictNonEmptyStringSchema.optional(),
    why_allowed: StrictNonEmptyStringSchema.optional(),
    missing_capability_or_fact: StrictNonEmptyStringSchema.optional(),
    risk_class: z.enum(["low", "medium", "high", "critical"]),
    evidence_refs: z.array(StrictNonEmptyStringSchema).max(32),
    recommended_next_step: StrictNonEmptyStringSchema.optional(),
  })
  .refine((d) => d.why_blocked !== undefined || d.why_allowed !== undefined, {
    message: "Provide why_blocked or why_allowed",
    path: ["why_blocked"],
  });

/**
 * execute_v3 Step 6D.1 — escalation-ready payload for blocked / approval-seeking actions.
 * No bare question strings: every field is structured for audit and downstream persistence.
 */
export const EscalationReadyShapeSchema = z
  .object({
    whatWasAsked: StrictNonEmptyStringSchema,
    intendedAction: StrictNonEmptyStringSchema,
    blockedByDecisionMode: z.enum(["auto", "draft_only", "ask_first", "forbidden"]),
    photographerQuestion: StrictNonEmptyStringSchema,
    defaultRecommendation: StrictNonEmptyStringSchema.optional(),
    answerStorageTarget: z.enum([
      "playbook_rules",
      "memories",
      "escalation_requests",
      "undetermined",
    ]),
  })
  .strict();

/**
 * `toolEscalate` — requires canonical `actionKey`, full escalation shape, and `DecisionJustificationSchema`.
 * Persists nothing in Step 6D.1; validates and returns structured facts for later workers.
 */
export const ToolEscalateInputSchema = z
  .object({
    actionKey: StrictNonEmptyStringSchema,
    escalation: EscalationReadyShapeSchema,
    justification: DecisionJustificationSchema,
  })
  .strict();

// ── Tool input schemas ────────────────────────────────────────────────────────

/** Availability window + event kind (`event_type` in DATABASE_SCHEMA.md). Optional `weddingId` enables a self-serve booking link in tool results. */
export const CalendarToolInputSchema = z
  .object({
    rangeStart: ParseableInstantStringSchema,
    rangeEnd: ParseableInstantStringSchema,
    eventType: z.enum(["about_call", "timeline_call", "gallery_reveal", "other"]),
    weddingId: z.uuid().optional(),
  })
  .refine(
    (data) =>
      Date.parse(data.rangeStart) <= Date.parse(data.rangeEnd),
    { message: "rangeStart must be before or equal to rangeEnd", path: ["rangeEnd"] },
  );

/** Book a concrete calendar event on the tenant calendar. */
export const BookCalendarEventSchema = z
  .object({
    weddingId: z.uuid(),
    title: StrictNonEmptyStringSchema,
    eventType: z.enum(["about_call", "timeline_call", "gallery_reveal", "other"]),
    startTime: ParseableInstantStringSchema,
    endTime: ParseableInstantStringSchema,
  })
  .refine(
    (data) => Date.parse(data.startTime) <= Date.parse(data.endTime),
    { message: "startTime must be before or equal to endTime", path: ["endTime"] },
  );

/** Origin / destination + travel window (`startDate` / `endDate`). */
export const TravelToolInputSchema = z
  .object({
    origin: StrictNonEmptyStringSchema,
    destination: StrictNonEmptyStringSchema,
    startDate: ParseableInstantStringSchema,
    endDate: ParseableInstantStringSchema,
  })
  .refine(
    (data) => Date.parse(data.startDate) <= Date.parse(data.endDate),
    { message: "startDate must be before or equal to endDate", path: ["endDate"] },
  );

/**
 * `update_wedding_project_stage` / `executeCrmTool` — contract only (execute_v3 Step 6E).
 *
 * - **Reads:** `weddings.id`, `weddings.stage` for the row matching `weddingId` + tenant `photographer_id`.
 * - **Writes:** `weddings.stage` only when `decisionMode === "auto"` and stage changes; emits Inngest `crm/stage.updated`.
 * - **Read-only vs write:** write-capable under `auto`; non-`auto` returns structured refusal (no row update).
 * - **Verifier:** does not call `toolVerifier`. Callers must run message-level `toolVerifier` (and any other gates) before
 *   treating a CRM write as safe in context; `decisionMode` is the in-tool policy gate for this write.
 * - **Roles:** main orchestrator and operator-style execution agents with tenant `photographer_id`; not the verifier role
 *   (verifier gates only) and not the writer/persona role for direct CRM mutations (Phase 6.5 intent).
 *
 * Non-`auto` `decisionMode` requires structured `justification` and Step 6D.1 `escalation`; runtime refuses the write
 * unless `decisionMode === "auto"`.
 */
export const CrmToolInputSchema = z
  .object({
    weddingId: z.uuid(),
    projectStage: z.enum([
      "inquiry",
      "consultation",
      "proposal_sent",
      "contract_out",
      "booked",
      "prep",
      "final_balance",
      "delivered",
      "archived",
    ]),
    decisionMode: z
      .enum(["auto", "draft_only", "ask_first", "forbidden"])
      .default("auto"),
    justification: DecisionJustificationSchema.optional(),
    escalation: EscalationReadyShapeSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.decisionMode !== "auto" && data.justification === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "justification is required when decisionMode is not auto (Phase 6C structured justification)",
        path: ["justification"],
      });
    }
    if (data.decisionMode !== "auto") {
      if (data.escalation === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "escalation (Step 6D.1 escalation-ready shape) is required when decisionMode is not auto",
          path: ["escalation"],
        });
      } else if (data.escalation.blockedByDecisionMode !== data.decisionMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "escalation.blockedByDecisionMode must match decisionMode",
          path: ["escalation", "blockedByDecisionMode"],
        });
      }
    }
  });

/**
 * Numeric aggregation for quotes and packages (execute_v3 Phase 6 Step 6B — `toolCalculator`).
 * Structured in/out only; no natural-language output from the tool itself.
 */
export const CalculatorToolInputSchema = z
  .object({
    operation: z.enum(["sum", "product", "min", "max", "mean"]),
    values: z.array(z.number().finite()).min(1).max(64),
  })
  .strict();

/**
 * `toolVerifier` — execute_v3 Phase 6 Step 6D (narrow slice: broadcast risk only).
 * Backend-resolved `broadcastRisk` + intended execution mode; extend schema in later steps.
 * Step 6D.1: when high broadcast risk would block `auto`, `escalation` is required.
 */
export const ToolVerifierInputSchema = z
  .object({
    broadcastRisk: z.enum(["low", "medium", "high", "unknown"]),
    requestedExecutionMode: z.enum(["auto", "draft_only", "ask_first", "forbidden"]),
    escalation: EscalationReadyShapeSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const blocksAuto =
      data.broadcastRisk === "high" && data.requestedExecutionMode === "auto";
    if (blocksAuto) {
      if (data.escalation === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "escalation (Step 6D.1 escalation-ready shape) is required when high broadcast risk blocks auto execution",
          path: ["escalation"],
        });
      } else if (data.escalation.blockedByDecisionMode !== "auto") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "escalation.blockedByDecisionMode must be auto when verifier blocks auto due to broadcast risk",
          path: ["escalation", "blockedByDecisionMode"],
        });
      }
    }
  });

// ── Inferred types ───────────────────────────────────────────────────────────

export type TenantPhotographerId = z.infer<typeof TenantPhotographerIdSchema>;
export type DecisionJustification = z.infer<typeof DecisionJustificationSchema>;
export type CalendarToolInput = z.infer<typeof CalendarToolInputSchema>;
export type BookCalendarEventInput = z.infer<typeof BookCalendarEventSchema>;
export type TravelToolInput = z.infer<typeof TravelToolInputSchema>;
export type CrmToolInput = z.infer<typeof CrmToolInputSchema>;
export type CalculatorToolInput = z.infer<typeof CalculatorToolInputSchema>;
export type ToolVerifierInput = z.infer<typeof ToolVerifierInputSchema>;
export type EscalationReadyShape = z.infer<typeof EscalationReadyShapeSchema>;
export type ToolEscalateInput = z.infer<typeof ToolEscalateInputSchema>;
