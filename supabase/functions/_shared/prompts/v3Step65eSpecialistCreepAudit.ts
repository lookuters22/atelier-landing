/**
 * execute_v3 Phase 6.5 Step 6.5E — specialist creep verification (this slice: **no new specialist**).
 *
 * **Rule:** Before any *future* specialist is wired into production, add a dedicated **context contract**
 * first (allowed inputs, memory layers, tools — explicit allowlists). Do **not** pass full `AgentContext` or
 * `DecisionContext` to a narrow role by default.
 *
 * ## Audit (verification only — no code wiring changed)
 *
 * - **`v3TargetAgentRoles.ts`** still defines exactly **five** reasoning roles — no additional role keys were added in this slice.
 * - **`buildDecisionContext`** call sites remain the policy/orchestration paths (`clientOrchestratorV1.ts`, `milestoneFollowups.ts`)
 *   plus the shared factory — no new consumer that hands unrestricted decision context to a new subagent.
 * - **Writer / persona** uses the narrowed boundary in `persona/personaAgent.ts` (Step 6.5C), not the full operational graph.
 * - **Legacy `ai/intent.*` workers** (intake, commercial, concierge, logistics, …) are pre-existing strangler routing;
 *   they are operational workers, not new Phase 6.5 “specialist” roles added here.
 *
 * **Result:** No accidental specialist creep detected for this slice; stop after Step 6.5E.
 */
export const V3_STEP65E_NO_SPECIALIST_CREEP_DETECTED = true as const;
