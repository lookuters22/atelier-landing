/**
 * execute_v3 Phase 6.5 Step 6.5B — **main orchestrator** role contract (this file only).
 *
 * Role key: `main_orchestrator` (`v3TargetAgentRoles.ts`). Heavy-context consumer per §6.5D; must still
 * respect §6.5F (no unrestricted high-risk PII in prompts — use document + verifier-gated flows).
 *
 * This module is declarative documentation + closed const sets; runtime wiring may subset these lists.
 */

// ── Allowed inputs (what this role may receive as reasoning context) ─────────

/**
 * Structured inputs the main orchestrator is allowed to consume — not raw service-role table dumps.
 * Maps to `DecisionContext` / `AgentContext` + versioned event envelopes.
 */
export const MAIN_ORCHESTRATOR_ALLOWED_INPUTS = [
  /** `buildDecisionContext` output (`decisionContext.types.ts`). */
  "decision_context_v1",
  /** `ai/orchestrator.client.v1` payload: schemaVersion, tenant ids, channel, raw inbound, execution mode hints. */
  "orchestrator_client_v1_event",
  /** Reply channel + thread identifiers only as resolved on the envelope (no spoofed client identity). */
  "resolved_channel_and_thread_ids",
] as const;

export type MainOrchestratorAllowedInput =
  (typeof MAIN_ORCHESTRATOR_ALLOWED_INPUTS)[number];

// ── Allowed memory layers (§6.5D — heavy-context role) ─────────────────────────

/**
 * Memory / policy layers this role may receive. Aligns with `AgentContext` + `DecisionContext` fields.
 */
export const MAIN_ORCHESTRATOR_ALLOWED_MEMORY_LAYERS = [
  "recent_messages",
  "thread_summary",
  "memory_headers",
  "selected_memories_full",
  "global_knowledge_hits",
  "playbook_rules_active",
  "audience_snapshot",
  "escalation_state",
  "candidate_wedding_ids",
  "crm_snapshot",
] as const;

export type MainOrchestratorAllowedMemoryLayer =
  (typeof MAIN_ORCHESTRATOR_ALLOWED_MEMORY_LAYERS)[number];

// ── Callable tools (bounded capabilities; names match `_shared/tools` surface) ─

/**
 * Data / planning / mutation tools the main orchestrator loop may invoke (subject to playbook `decision_mode` + gates).
 * `toolVerifier` is listed under a separate gate entry so the verifier role boundary stays explicit (§6.5B per-role).
 */
export const MAIN_ORCHESTRATOR_CALLABLE_DATA_TOOLS = [
  "check_calendar_availability",
  "book_calendar_event",
  "estimate_travel_costs",
  "update_wedding_project_stage",
  "search_past_communications",
  "toolCalculator",
  "toolEscalate",
] as const;

/**
 * Verifier gate tool — orchestration may **sequence** this before `auto` execution (Step 6D); logic owned by verifier role.
 */
export const MAIN_ORCHESTRATOR_VERIFIER_GATE_TOOL = "toolVerifier" as const;

export type MainOrchestratorCallableDataTool =
  (typeof MAIN_ORCHESTRATOR_CALLABLE_DATA_TOOLS)[number];

// ── Proposable actions (structured action families — not silent side effects) ─

/**
 * Canonical `action_key` families this role may **propose** for downstream routing / playbook resolution.
 * Subset of DATABASE_SCHEMA §5.17 vocabulary; does not add new families beyond execute_v3 scope.
 */
export const MAIN_ORCHESTRATOR_PROPOSABLE_ACTION_KEYS = [
  "send_message",
  "schedule_call",
  "move_call",
  "share_document",
  "send_invoice",
  "discount_quote",
  "banking_exception",
  "payment_reconciliation",
  "release_raw_files",
  "release_gallery_assets",
  "publication_permission",
  "vendor_credit_approval",
  "respond_to_art_feedback",
  "visual_review_required",
  "share_sensitive_data",
  "update_crm",
  "operator_notification_routing",
] as const;

export type MainOrchestratorProposableActionKey =
  (typeof MAIN_ORCHESTRATOR_PROPOSABLE_ACTION_KEYS)[number];

// ── Directly executable (within the orchestrator process, no human approval) ──

/**
 * Only non-committal or tool-scoped automations. Outbound client/operator sends stay in **workers** (outbound, approvals).
 * CRM/calendar writes still require `decision_mode === "auto"` and passing verifier/policy gates where applicable.
 */
export const MAIN_ORCHESTRATOR_DIRECTLY_EXECUTABLE = [
  "numeric_calculator_deterministic",
  "structured_escalation_payload_validate_only",
  "read_only_rag_search",
] as const;

export type MainOrchestratorDirectlyExecutable =
  (typeof MAIN_ORCHESTRATOR_DIRECTLY_EXECUTABLE)[number];
