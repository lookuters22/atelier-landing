# V3 RBAC And Audience Safety Plan

**Implementation status:** The **roadmap Phase 1** slice for **`clientOrchestratorV1` + shared redaction** is **closed** — see [V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md](C:/Users/Despot/Desktop/wedding/docs/v3/V3_RBAC_AUDIENCE_PHASE1_CLOSEOUT.md). The numbered phases below remain the conceptual model (classification → assembly → verifier → stress proof); stress-test and hosted matrix proofs are tracked under Phase 4 here.

## Goal
Prevent private commercial or internal information from reaching the wrong audience.

## Why This Track Exists
Stress Test 7 and similar scenarios show that planner commission, agency fee, and internal pricing logic can be valid in planner-only communication but dangerous in client-visible threads.

## Phase 1
Recipient Role Classification

### Objective
Classify outgoing audiences into safe visibility buckets before drafting.

### Implement
- planner-only
- client-visible
- vendor-only
- internal-only
- mixed audience

### Rules
- if any couple/client address is in `To` or `CC`, treat as `client-visible`
- mixed audience with client present is `client-visible`
- do not assume `payer` is safe for planner commission visibility

### Target Areas
- audience resolution in decision context
- thread participant visibility rules
- outgoing audience contract used by orchestrator/verifier

### Proof
- planner-only thread keeps planner-private context
- client-visible thread strips planner-private context
- mixed thread strips planner-private context

## Phase 2
Context Redaction At Assembly Time

### Objective
Prevent sensitive private-commercial facts from ever reaching the writer for the wrong audience.

### Redact For Client-Visible Audiences
- planner commission
- agency fee
- internal markup/margin notes
- internal negotiation notes
- internal commercial concessions not meant for the client

### Proof
- inspect writer facts payloads for planner-only vs client-visible cases
- confirm redacted facts do not appear in client-visible payloads

## Phase 3
Verifier Backstop

### Objective
Catch leakage even if some sensitive fact reaches a downstream path.

### Block For Client-Visible Audiences
- `commission`
- `agency fee`
- `markup`
- internal private-deal wording

### Proof
- generate intentionally risky draft in test path
- verifier blocks or downgrades it

## Phase 4
Stress-Test Proof

### Proof artifacts (repo)
- **Stress Test 7 (CI):** `npm run v3:proof-stress7-rbac-audience` — `supabase/functions/_shared/qa/stressTest7RbacAudienceProof.test.ts`
- **Stress Tests 5 & 8 (CI):** `npm run v3:proof-stress5-8-rbac-audience` — `supabase/functions/_shared/qa/stressTest5And8RbacAudienceProof.test.ts`
- **Live DB (ST7 + ST5 + ST8 shapes):** `npm run v3:proof-rbac-audience` — `scripts/v3_rbac_audience_proof_harness.ts` → `reports/v3-rbac-audience-proof-*.md` (schema `v3_rbac_audience_proof_v2`, eight cases)
- **Runtime E2E (orchestrator core + persona auditors, Stress Test 7 mixed seed):** `npm run v3:proof-rbac-audience-e2e` — `supabase/functions/_shared/qa/v3RbacAudienceRuntimeE2eProof.test.ts` → `reports/v3-rbac-audience-runtime-e2e-*.md` (in-process `executeClientOrchestratorV1Core`; not the deployed worker)
- **Hosted Inngest worker E2E (Event API → `clientOrchestratorV1`, ST7 private-commercial shape):** `npm run v3:proof-rbac-inngest-hosted` or `npm run v3:deploy-inngest-and-proof-rbac-inngest-hosted` — `scripts/v3_rbac_audience_inngest_hosted_proof.ts` → `reports/v3-rbac-inngest-hosted-matrix-*.md` / `.json` (schema `v3_rbac_inngest_hosted_proof_matrix_v2`) — **3-case matrix:** `st7_planner_only`, `st7_client_visible`, `st7_mixed_audience`. **Persona + output auditors on hosted runs** require `ANTHROPIC_API_KEY` as a **Supabase project secret** (not only local `.env`): `npm run v3:sync-anthropic-secret-supabase` then `npm run deploy:inngest`. The proof script defaults to requiring persona/auditor evidence in `instruction_history` (`V3_RBAC_INNGEST_HOSTED_REQUIRE_PERSONA=0` to allow stub-only).
- **Slice reports:** `reports/v3-stress7-rbac-audience-slice-2026-04-08.md`, `reports/v3-stress5-8-rbac-audience-slice.md`
- Shared copy: `supabase/functions/_shared/qa/stressTestAudienceFixtures.ts`

### Target Scenario
Stress Test 7 first, then Stress Test 5 and 8.

### Cases
1. planner-only discussion of commission
2. client-visible negotiation
3. mixed planner + client email

### Pass Criteria
- no planner commission or markup leaks to client-visible draft
- planner-only case still works normally

