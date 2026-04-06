/**
 * execute_v3 Phase 6.5 Step 6.5A — **closed** target reasoning role set (no extra roles).
 *
 * Source: `docs/v3/execute_v3.md` § Phase 6.5 Step 6.5A. Specialization beyond this set should go to
 * tools and workers first (§6.5H). Escalation and archivist may stay lightweight modes in runtime.
 *
 * | Key | Doc line |
 * |-----|----------|
 * | `main_orchestrator` | main orchestrator |
 * | `verifier` | verifier |
 * | `operator_escalation` | operator escalation agent |
 * | `writer_persona` | writer or persona agent |
 * | `archivist_learning` | archivist or learning path |
 */
export const V3_TARGET_AGENT_ROLES = [
  "main_orchestrator",
  "verifier",
  "operator_escalation",
  "writer_persona",
  "archivist_learning",
] as const;

export type V3TargetAgentRole = (typeof V3_TARGET_AGENT_ROLES)[number];

/** One human-readable label per role key — for prompts and structured logs only. */
export const V3_TARGET_AGENT_ROLE_LABELS = {
  main_orchestrator: "Main orchestrator",
  verifier: "Verifier",
  operator_escalation: "Operator escalation agent",
  writer_persona: "Writer / persona agent",
  archivist_learning: "Archivist / learning path",
} as const satisfies Record<V3TargetAgentRole, string>;

export function isV3TargetAgentRole(value: string): value is V3TargetAgentRole {
  return (V3_TARGET_AGENT_ROLES as readonly string[]).includes(value);
}
