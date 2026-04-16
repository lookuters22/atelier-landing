# V3 Phase 1 — Audience / RBAC Hardening — Closeout

**Status:** Phase 1 **complete** for the **client orchestrator (`clientOrchestratorV1`) + shared redaction** path.  
**Closeout date:** 2026-04-14 (evidence: implemented modules + focused Vitest coverage; broad stress proofs remain Phase 4 per plan).

## What Was In Scope (Implemented)

Classification and wiring:

- `supabase/functions/_shared/context/resolveAudienceVisibility.ts` — audience classification into `DecisionContext.audience`.
- `supabase/functions/_shared/context/buildDecisionContext.ts` — `DecisionAudienceSnapshot` on the decision context.
- Decision explanation / orchestrator tooling includes structured audience where applicable (e.g. `buildV3ClientOrchestratorDecisionExplanation`).

Defense-in-depth redaction for **`clientVisibleForPrivateCommercialRedaction === true`** (planner-only / non–client-visible runs keep full context):

| Boundary | Mechanism |
|----------|-----------|
| Decision context (memory, thread, messages, global knowledge) | `applyAudiencePrivateCommercialRedaction` in `applyAudiencePrivateCommercialRedaction.ts` |
| Orchestrator context injection (digests, facts, retrieval trace lines) | `redactOrchestratorContextInjectionForAudience` |
| Persona writer **input** (orchestrator-assembled facts string) | `redactPersonaWriterFactsBlockForAudience` (line-wise / multiline-safe) before `draftPersonaStructuredResponse` |
| Deterministic **stub** `drafts.body` | `buildOrchestratorStubDraftBody` + audience passed from draft attempt (no-persona, persona-skipped, stub-restore) |
| Persona **output prose** (client-visible) | `auditPlannerPrivateLeakage` + existing commercial auditors on `email_draft` |
| **`instruction_history` structured metadata** | `redactPersonaCommittedTermsForAudience` on `committed_terms.package_names`; `budget_statement_injection.approved_excerpt` redacted when persisted |

**Key files:** `applyAudiencePrivateCommercialRedaction.ts`, `buildOrchestratorSupportingContextInjection.ts`, `attemptOrchestratorDraft.ts`, `maybeRewriteOrchestratorDraftWithPersona.ts`, `clientOrchestratorV1Core.ts`, `inngest/functions/clientOrchestratorV1.ts`.

## Intentionally Left For Later (Not Phase 1 Blockers)

### Optional / channel-specific hardening

- **Non–`clientOrchestratorV1` writers** (e.g. WhatsApp orchestrator, triage-only paths, legacy persona entry points): not part of this Phase 1 slice; reuse the same redaction helpers when touching those surfaces.
- **Verifier expansion** beyond current `auditPlannerPrivateLeakage` + commercial audit: mapped to **Phase 3** in [V3_RBAC_AUDIENCE_PLAN.md](V3_RBAC_AUDIENCE_PLAN.md).
- **Full stress-test / hosted proof matrix** as the formal “done” gate for the whole RBAC *track*: **Phase 4** proof artifacts in the plan (`npm run v3:proof-*` scripts, Inngest hosted matrix, etc.).

### Doc alignment note

[V3_RBAC_AUDIENCE_PLAN.md](V3_RBAC_AUDIENCE_PLAN.md) uses its own “Phase 1–4” numbering (classification → assembly redaction → verifier → stress proof). **This repo’s implemented assembly redaction maps to that doc’s Phase 2-style work**, delivered under the **roadmap “Phase 1”** track item (narrow orchestrator path). No contradiction: roadmap Phase 1 = first **priority** slice; audience plan phases = conceptual layers.

## When To Reopen Phase 1

Revisit this area if:

- A **production or QA incident** shows planner-private commercial language in a **client-visible** artifact (draft body, approval payload, logs, or `instruction_history`) on a path that uses **`clientOrchestratorV1`** / the shared redaction module.
- A **new downstream surface** stores orchestrator or persona output without going through the existing boundaries.
- **Classification** is wrong (e.g. mixed-audience thread classified as planner-only).

Otherwise, treat new work as **follow-on slices** (verifier, other channels, stress proofs), not “Phase 1 incomplete.”

## Next Roadmap Slice (Handoff)

Per [V3_ROADMAP_MASTER.md](V3_ROADMAP_MASTER.md) **Priority Order**, the next track after audience/RBAC is:

**Phase 2 — Operator WhatsApp completion**  
Plan: [V3_OPERATOR_WHATSAPP_PLAN.md](V3_OPERATOR_WHATSAPP_PLAN.md)

Rationale from the master doc: unlock silent-hold / human resolution, prerequisite for meaningful replay on blocked scenarios, without weakening writer boundaries.

## Exit Signal

Phase 1 is **closed** from an implementation standpoint: no further bounded **orchestrator-path** audience/RBAC work is required before moving on unless an incident or new surface appears.
