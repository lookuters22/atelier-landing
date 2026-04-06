# POST-V3 CLEANup Audit

## 1. Legacy Ghost Code (The Strangler Cleanup)

**Status:** FAIL

### Findings

- **Legacy worker roster is still active in runtime registration**
  - Files: `supabase/functions/inngest/index.ts:17-34`, `supabase/functions/inngest/index.ts:43-58`
  - Functions: `triageFunction`, `personaFunction`, `internalConciergeFunction`, `conciergeFunction`, `logisticsFunction`, `commercialFunction`, `projectManagerFunction`, `studioFunction`, `whatsappOrchestratorFunction`
  - Finding: The Inngest registry still keeps the V1/V2 `ai/intent.*` chain and legacy WhatsApp worker set live alongside the V3 orchestrators.
  - Recommended action: Remove these workers only in a dedicated cutover once replay and rollout gates are satisfied.

- **Ingress still routes real traffic into legacy `ai/intent.*` workers instead of the V3 client orchestrator**
  - Files: `supabase/functions/inngest/functions/triage.ts:110-117`, `supabase/functions/inngest/functions/triage.ts:405-430`
  - Function: `triageFunction`
  - Finding: Email/web traffic is still dispatched through `INTENT_EVENT_MAP` to `ai/intent.intake`, `ai/intent.concierge`, `ai/intent.logistics`, etc., while `ai/orchestrator.client.v1` remains QA-only.
  - Recommended action: Keep this until exit criteria pass, then cut ingress over to the V3 orchestrator and retire the old dispatch map.

- **Legacy WhatsApp bridge into old internal concierge remains active**
  - Files: `supabase/functions/inngest/functions/triage.ts:122-149`, `supabase/functions/inngest/functions/internalConcierge.ts:1-18`, `supabase/functions/inngest/functions/internalConcierge.ts:272-414`
  - Functions: `triageFunction`, `internalConciergeFunction`
  - Finding: Legacy `comms/whatsapp.received` and `operator/whatsapp.legacy.received` still hand off to `ai/intent.internal_concierge`.
  - Recommended action: Safe to delete this bridge only after operator WhatsApp traffic is fully cut over to `operator/whatsapp.inbound.v1`.

- **Legacy persona handoff chain is still part of the main path**
  - Files: `supabase/functions/inngest/functions/intake.ts:210-211`, `supabase/functions/inngest/functions/concierge.ts:170-179`, `supabase/functions/inngest/functions/logistics.ts:181-190`, `supabase/functions/inngest/functions/persona.ts:12-13`, `supabase/functions/inngest/functions/persona.ts:217-425`
  - Functions: `intakeFunction`, `conciergeFunction`, `logisticsFunction`, `personaFunction`
  - Finding: Multiple specialist workers still funnel to `ai/intent.persona`, preserving the legacy research-worker -> persona-worker draft pipeline.
  - Recommended action: Retire these handoffs during the final strangler cleanup when the orchestrator-based path owns production drafting.

- **Legacy `whatsapp_number` is still referenced as an active compatibility surface**
  - Files: `src/pages/settings/SettingsHubPage.tsx:137`, `src/pages/settings/SettingsHubPage.tsx:237`, `supabase/functions/webhook-whatsapp/index.ts:93-119`, `supabase/functions/inngest/functions/internalConcierge.ts:287-288`
  - Functions: `SettingsHubPage`, `resolvePhotographerByStudioNumber`, `internalConciergeFunction`
  - Finding: The repo still reads and writes `photographers.settings.whatsapp_number` even though `admin_mobile_number` is the target operator identity field.
  - Recommended action: Keep this as a temporary compatibility field, then remove it once all operator-number flows use `admin_mobile_number` only.

## 2. Tenant Isolation Regressions (The #1 Risk)

**Status:** FAIL

### Findings

- **Internal concierge client lookup is not tenant-scoped**
  - Files: `supabase/functions/inngest/functions/internalConcierge.ts:166-191`
  - Function: `handleToolCall` (`query_clients`)
  - Finding: `clients` are searched with no `.eq("photographer_id", photographerId)` and no ownership proof via a parent join, so a service-role tool call can read across tenants.
  - Recommended action: Add a tenant proof chain for `clients` queries before this worker is trusted again.

- **Internal concierge pending-drafts lookup is not tenant-scoped**
  - Files: `supabase/functions/inngest/functions/internalConcierge.ts:209-219`
  - Function: `handleToolCall` (`query_pending_drafts`)
  - Finding: Pending drafts are queried by `status` only, with no tenant filter on `drafts.photographer_id`.
  - Recommended action: Add `.eq("photographer_id", photographerId)` to the drafts query.

- **Legacy specialist workers still perform service-role reads/writes without explicit tenant filters**
  - Files: `supabase/functions/inngest/functions/commercial.ts:38-44`, `supabase/functions/inngest/functions/commercial.ts:72-80`, `supabase/functions/inngest/functions/logistics.ts:88-103`, `supabase/functions/inngest/functions/logistics.ts:171-175`, `supabase/functions/inngest/functions/concierge.ts:96-111`, `supabase/functions/inngest/functions/persona.ts:238-242`, `supabase/functions/inngest/functions/persona.ts:393-400`
  - Functions: `commercialFunction`, `logisticsFunction`, `conciergeFunction`, `personaFunction`
  - Finding: Several legacy workers use service-role queries by `wedding_id` or `thread_id` without also appending the target-state `.eq("photographer_id", tenantId)` guard.
  - Recommended action: Either harden every legacy worker query with tenant filters now or delete these workers during cutover.

- **Web ingress is correctly hardened**
  - Files: `supabase/functions/webhook-web/index.ts:75-109`
  - Function: anonymous/JWT tenant derivation inside `Deno.serve`
  - Finding: `webhook-web` derives tenant from verified JWT or a signed ingress token and no longer trusts body `photographer_id`.
  - Recommended action: PASS — keep the current JWT/HMAC ingress model and do not reintroduce raw body tenant fields.

- **Twilio operator ingress is authenticated but still anchored to a legacy studio-number field**
  - Files: `supabase/functions/webhook-whatsapp/index.ts:93-119`, `supabase/functions/webhook-whatsapp/index.ts:177-189`
  - Functions: `resolvePhotographerByStudioNumber`, main webhook handler
  - Finding: Twilio signature verification is present, but tenant resolution still keys off `settings.whatsapp_number`, which is explicitly a migration-era compatibility field.
  - Recommended action: Move operator-lane tenant resolution to the canonical operator-number contract once the field cutover is complete.

## 3. Architectural Bypasses (Tools & Verifier)

**Status:** FAIL

### Findings

- **Frontend can still write outbound/internal messages directly**
  - Files: `src/hooks/useSendMessage.ts:35-59`
  - Function: `sendMessage`
  - Finding: The dashboard inserts directly into `messages` with no verifier gate, no `decision_mode` check, and no tool-layer contract.
  - Recommended action: Route this surface through a gated backend action instead of direct `messages` inserts.

- **Commercial worker performs a direct CRM-stage mutation outside the strict tool layer**
  - Files: `supabase/functions/inngest/functions/commercial.ts:72-80`
  - Function: `commercialFunction`
  - Finding: The worker updates `weddings.contract_value` and `weddings.stage` directly instead of using the Phase 6 CRM tool contract and decision-mode gate.
  - Recommended action: Replace the raw write with the strict CRM tool/verifier path or retire the worker.

- **Logistics worker performs raw DB writes instead of a tool-layer contract**
  - Files: `supabase/functions/inngest/functions/logistics.ts:166-178`
  - Function: `logisticsFunction`
  - Finding: The worker appends `story_notes` directly under service role, bypassing any structured verifier/tool policy.
  - Recommended action: Move this write behind a bounded tool contract or decommission the worker in favor of V3 orchestration.

- **Legacy persona worker can send WhatsApp directly without `toolVerifier` or approval gating**
  - Files: `supabase/functions/inngest/functions/persona.ts:390-412`
  - Function: `personaFunction`
  - Finding: If `reply_channel === "whatsapp"`, the worker sends client-facing WhatsApp immediately from the persona flow, bypassing the V3 verifier and decision-mode model.
  - Recommended action: Remove direct outbound sends from the persona worker and keep all delivery behind verifier-approved outbound workers.

- **Legacy runtime still drafts through `ai/intent.* -> persona -> approval/outbound` instead of the V3 orchestrator**
  - Files: `supabase/functions/inngest/functions/triage.ts:405-430`, `supabase/functions/inngest/functions/concierge.ts:170-179`, `supabase/functions/inngest/functions/logistics.ts:181-190`, `supabase/functions/inngest/functions/outbound.ts:24-27`, `supabase/functions/inngest/functions/outbound.ts:95-113`
  - Functions: `triageFunction`, `conciergeFunction`, `logisticsFunction`, `outboundFunction`
  - Finding: The live production path still bypasses the V3 orchestrator/verifier stack and uses the legacy intent workers plus approval/outbound pipeline.
  - Recommended action: Complete the orchestrator cutover before trusting the new architecture claims for enforcement.

- **V3 client orchestrator itself respects the verifier boundary**
  - Files: `supabase/functions/inngest/functions/clientOrchestratorV1.ts:200-218`
  - Function: `clientOrchestratorV1Function`
  - Finding: The V3 orchestrator does run `executeToolVerifier()` before its placeholder action, and the execution-mode payload is explicit.
  - Recommended action: PASS — use this path as the target pattern during cutover.

## 4. Sleeper & Pause Violations

**Status:** FAIL

### Findings

- **Calendar reminders wake without checking pause/lock flags**
  - Files: `supabase/functions/inngest/functions/calendarReminders.ts:92-145`, `supabase/functions/inngest/functions/calendarReminders.ts:160-219`
  - Function: `calendarRemindersFunction`
  - Finding: After both sleep boundaries, the worker re-checks only the `calendar_events` row and never re-queries `weddings.compassion_pause`, `weddings.strategic_pause`, or `weddings.agency_cc_lock`; it also still inserts drafts without `photographer_id`.
  - Recommended action: Add immediate post-wake wedding pause checks before drafting either reminder.

- **Post-wedding anniversary path wakes without a pause/state recheck**
  - Files: `supabase/functions/inngest/functions/postWeddingFlow.ts:113-170`
  - Function: `postWeddingFunction`
  - Finding: After `step.sleepUntil("sleep-until-anniversary", ...)`, the worker only verifies that the wedding row still exists, not whether pause/lock flags or stage changes should suppress outreach; it also still inserts drafts without `photographer_id`.
  - Recommended action: Re-query `weddings` for pause flags and valid stage immediately after wake before drafting the anniversary message.

- **Contract follow-up sleep boundary is properly re-verified**
  - Files: `supabase/functions/inngest/functions/milestoneFollowups.ts:31-83`
  - Function: `contractFollowupFunction`
  - Finding: This worker does re-query the wedding after waking and stops on `compassion_pause`, `strategic_pause`, `agency_cc_lock`, stage drift, or milestone completion.
  - Recommended action: PASS — use this worker as the expected pause-check pattern.

- **Prep-phase follow-ups now follow the correct wake-check pattern**
  - Files: `supabase/functions/inngest/functions/prepPhaseFollowups.ts:114-151`, `supabase/functions/inngest/functions/prepPhaseFollowups.ts:213-248`
  - Function: `prepPhaseFunction`
  - Finding: The worker re-verifies wedding state and pause flags after both the T-60d sleep and the 5-day reminder sleep.
  - Recommended action: PASS — keep this pattern and mirror it in the remaining sleeper workers.

