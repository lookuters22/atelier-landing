# Orchestrator: booking-progress vs authority policy (AP1)

## Problem this solves

Normal **inquiry / booking-progress** emails (next steps to book, inclusion questions, local fee questions, scheduling a call) must not be routed like **authority or binding-approval ambiguity** (`v3_authority_policy_clarification`). Those paths exist for real multi-actor, binding-approval, or commitment-level commercial risk.

## Rules (non-negotiable)

1. **AP1 escalation uses the current inbound only (`rawMessage`).** Thread summary and recent message bodies must **not** be sufficient on their own to trigger commercial or ambiguous-approval AP1. They may still feed **persona / drafting** via `DecisionContext` (continuity, CRM), which is separate from escalation.
2. **`drafts.body` is always safe to display** as draft content. Do not put orchestrator diagnostics, action keys, rationale blobs, QA path markers, or policy dumps in `body`. Put those in `instruction_history` (or other explicit metadata).
3. **Where to change behavior**
   - Booking-progress heuristics: `matchesInquiryBookingProgressInformationalTurn` in [`supabase/functions/_shared/orchestrator/detectAuthorityPolicyRisk.ts`](../../supabase/functions/_shared/orchestrator/detectAuthorityPolicyRisk.ts).
   - Authority escalation: [`supabase/functions/_shared/orchestrator/detectAuthorityPolicyRisk.ts`](../../supabase/functions/_shared/orchestrator/detectAuthorityPolicyRisk.ts).
   - Draft insert: [`supabase/functions/_shared/orchestrator/attemptOrchestratorDraft.ts`](../../supabase/functions/_shared/orchestrator/attemptOrchestratorDraft.ts).
   - Proposal ordering / clarification candidate: [`supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts`](../../supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts).

## Examples

**Should stay on a normal reply path (pending approval is fine):**

- “What are the next steps to officially book you?”
- “Are 24h sneak peeks included or extra?”
- “Is there a destination fee for [venue]?”
- “Can we do a quick call Thursday?”

**Should still be able to escalate (non-exhaustive):**

- Planner or vendor asking for discounts / payment-term changes without proper authority.
- “On behalf of the couple, please proceed with the deposit” from a non-allow-listed bucket.
- Contract modification / waiver language from the wrong role.
- Multi-actor timeline reduction or payer scope/spend per `detectMultiActorAuthorityRefinement`.

## Decision flow (high level)

`proposeClientOrchestratorCandidateActions` calls `detectAuthorityPolicyRisk`. When AP1 hits, the first draftable `send_message` is often `v3_authority_policy_clarification` because routine `send_message` is blocked. Fixing false AP1 restores routine `send_message` as the draftable candidate.

## Tests

See `detectAuthorityPolicyRisk.test.ts`, `proposeClientOrchestratorCandidateActions.test.ts`, and `attemptOrchestratorDraft.test.ts` for booking-progress fixtures, smearing regressions, and draft-body hygiene.
