/**
 * Deterministic read tools for the operator WhatsApp orchestrator (execute_v3 Phase 8 Step 8C).
 * All queries are scoped by photographer_id — no cross-tenant reads.
 *
 * Step 8E: `record_operator_escalation` sets `operator_delivery` and emits `operator/escalation.pending_delivery.v1`.
 * Step 10D: `create_awaiting_reply_task` — deduped `tasks` row with explicit `due_date` (no invented timers).
 */
import { formatOperatorEscalationQuestion } from "./formatOperatorEscalation.ts";
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
  type OperatorEscalationDeliveryPolicy,
} from "./inngest.ts";
import { createAwaitingReplyTaskDeduped } from "./operatorAwaitingReplyTask.ts";
import { supabaseAdmin } from "./supabase.ts";

export type OperatorToolContext = {
  photographerId: string;
  operatorThreadId: string;
  /** When `record_operator_escalation` succeeds, set to true (orchestrator skips duplicate WhatsApp). */
  escalationRecordedRef?: { value: boolean };
};

function parseOperatorDelivery(raw: unknown): OperatorEscalationDeliveryPolicy {
  const v = typeof raw === "string" ? raw : "";
  if (v === "batch_later" || v === "dashboard_only" || v === "urgent_now") return v;
  return "urgent_now";
}

const NOISE_WEDDING = new Set([
  "and",
  "&",
  "the",
  "wedding",
  "weddings",
  "of",
  "for",
  "in",
  "at",
  "is",
  "are",
  "it",
  "booked",
  "status",
  "stage",
]);

const NOISE_CLIENT = new Set(["and", "&", "the", "client", "clients", "of", "for"]);

export async function handleOperatorDataToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: OperatorToolContext,
): Promise<string> {
  const { photographerId, operatorThreadId } = ctx;

  switch (name) {
    case "query_weddings": {
      let query = supabaseAdmin
        .from("weddings")
        .select("id, couple_names, wedding_date, location, stage, contract_value, package_name")
        .eq("photographer_id", photographerId)
        .order("wedding_date", { ascending: true })
        .limit(10);

      if (args.stage && typeof args.stage === "string") {
        query = query.eq("stage", args.stage);
      }

      if (args.search_term && typeof args.search_term === "string") {
        const keywords = args.search_term
          .split(/[\s,&+]+/)
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && !NOISE_WEDDING.has(w));

        if (keywords.length > 0) {
          const clauses = keywords
            .map((kw: string) => `couple_names.ilike.%${kw}%,location.ilike.%${kw}%`)
            .join(",");
          query = query.or(clauses);
        }
      }

      const { data, error } = await query;
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No weddings found.";
      return JSON.stringify(data);
    }

    case "query_clients": {
      const { data: wrows } = await supabaseAdmin
        .from("weddings")
        .select("id")
        .eq("photographer_id", photographerId);

      const wids = (wrows ?? []).map((w) => w.id as string);
      if (wids.length === 0) return "No clients found.";

      let q = supabaseAdmin
        .from("clients")
        .select("id, name, email, role, wedding_id, weddings(couple_names)")
        .in("wedding_id", wids)
        .limit(15);

      if (args.search_term && typeof args.search_term === "string") {
        const keywords = args.search_term
          .split(/[\s,&+]+/)
          .map((w: string) => w.trim().toLowerCase())
          .filter((w: string) => w.length >= 2 && !NOISE_CLIENT.has(w));

        if (keywords.length > 0) {
          const clauses = keywords
            .map((kw: string) => `name.ilike.%${kw}%,email.ilike.%${kw}%`)
            .join(",");
          q = q.or(clauses);
        }
      }

      const { data, error } = await q;
      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No clients found.";
      return JSON.stringify(data);
    }

    case "query_tasks": {
      const status = (args.status as string) || "open";
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select("id, title, due_date, status, wedding_id, weddings(couple_names)")
        .eq("photographer_id", photographerId)
        .eq("status", status)
        .order("due_date", { ascending: true })
        .limit(10);

      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return `No ${status} tasks.`;
      return JSON.stringify(data);
    }

    case "query_pending_drafts": {
      const { data, error } = await supabaseAdmin
        .from("drafts")
        .select("id, body, status, created_at, threads(title, weddings(couple_names))")
        .eq("photographer_id", photographerId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No pending drafts.";
      return JSON.stringify(data);
    }

    case "list_open_escalations": {
      const { data, error } = await supabaseAdmin
        .from("escalation_requests")
        .select("id, action_key, question_body, status, created_at, wedding_id, operator_delivery")
        .eq("photographer_id", photographerId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) return `Error: ${error.message}`;
      if (!data || data.length === 0) return "No open escalations.";
      return JSON.stringify(data);
    }

    case "record_operator_escalation": {
      const action_key = String(args.action_key ?? "operator_blocked_action").slice(0, 128);
      const question_body = formatOperatorEscalationQuestion(String(args.question_body ?? ""));
      const reason_code = String(args.reason_code ?? "blocked_action").slice(0, 128);
      if (!question_body) return "Error: question_body is required for escalation.";

      const operator_delivery = parseOperatorDelivery(args.delivery_policy);

      const decision_justification = {
        why_blocked: String(args.why_blocked ?? "operator_lane_policy").slice(0, 2000),
        missing_capability_or_fact: String(args.missing_fact ?? "").slice(0, 2000),
        risk_class: String(args.risk_class ?? "operator_action").slice(0, 256),
        evidence_refs: [] as string[],
        recommended_next_step: String(args.recommended_next_step ?? "await_photographer_reply").slice(0, 1000),
      };

      const { data: inserted, error } = await supabaseAdmin
        .from("escalation_requests")
        .insert({
          photographer_id: photographerId,
          thread_id: operatorThreadId,
          wedding_id: typeof args.wedding_id === "string" ? args.wedding_id : null,
          action_key,
          reason_code,
          decision_justification,
          question_body,
          recommended_resolution:
            typeof args.recommended_resolution === "string" ? args.recommended_resolution : null,
          status: "open",
          operator_delivery,
        })
        .select("id")
        .single();

      if (error) return `Error: ${error.message}`;
      if (!inserted?.id) return "Error: escalation insert returned no id.";

      if (ctx.escalationRecordedRef) ctx.escalationRecordedRef.value = true;

      try {
        await inngest.send({
          name: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
          data: {
            schemaVersion: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_SCHEMA_VERSION,
            photographerId,
            escalationId: inserted.id as string,
            operatorDelivery: operator_delivery,
            questionBody: question_body,
            threadId: operatorThreadId,
          },
        });
      } catch (e) {
        console.error("[operatorDataTools] inngest.send escalation delivery failed:", e);
      }

      const policyHint =
        operator_delivery === "urgent_now"
          ? "Urgent — you will get a WhatsApp ping."
          : operator_delivery === "batch_later"
            ? "Queued for digest (no immediate ping)."
            : "Logged to dashboard only (no WhatsApp).";
      return `Escalation logged. ${policyHint}`;
    }

    case "create_awaiting_reply_task": {
      const wedding_id = typeof args.wedding_id === "string" ? args.wedding_id.trim() : "";
      const action_key = String(args.action_key ?? "").trim();
      const due_date = typeof args.due_date === "string" ? args.due_date.trim() : "";
      if (!action_key) return "Error: action_key is required.";
      if (!wedding_id) return "Error: wedding_id is required.";
      if (!due_date) return "Error: due_date is required (ISO 8601). Do not invent relative dates.";

      const result = await createAwaitingReplyTaskDeduped(supabase, {
        photographerId,
        weddingId: wedding_id,
        actionKey: action_key,
        dueDateIso: due_date,
      });

      if (!result.ok) return `Error: ${result.error}`;
      if (result.deduped) {
        return `Follow-up task already open for this action (deduped). task_id=${result.taskId}`;
      }
      return `Follow-up task created (awaiting reply). task_id=${result.taskId}`;
    }

    case "capture_operator_context": {
      const title = String(args.title ?? "Operator note").slice(0, 120);
      const summary = String(args.summary ?? "").trim().slice(0, 400);
      const full_content = String(args.full_content ?? args.summary ?? "").trim().slice(0, 8000);
      const wedding_id = typeof args.wedding_id === "string" ? args.wedding_id : null;
      if (!summary && !full_content) return "Error: summary or full_content required.";

      const { error } = await supabaseAdmin.from("memories").insert({
        photographer_id: photographerId,
        wedding_id,
        type: "operator_whatsapp_note",
        title,
        summary: summary || full_content.slice(0, 400),
        full_content: full_content || summary,
      });

      if (error) return `Error: ${error.message}`;
      return "Context saved as a studio memory.";
    }

    default:
      return `Unknown tool: ${name}`;
  }
}
