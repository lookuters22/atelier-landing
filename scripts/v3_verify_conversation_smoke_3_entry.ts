/**
 * Clean 3-turn V3 conversation smoke: inquiry/pricing → commercial follow-up → policy exception.
 * Uses the **same QA photographer** from `.qa_fixtures.json` but creates a **fresh `weddings` row per run**
 * (unless `V3_VERIFY_FRESH_WEDDING_PER_RUN=0`) so transcripts are not polluted by prior harness runs.
 *
 * Run: `npm run v3:verify-conversation-smoke-3`
 *
 * Requires live gate posture (e.g. `scripts/v3_verify_gate_posture.env`) and `INNGEST_EVENT_KEY` like the main harness.
 */
process.env.V3_VERIFY_SCENARIO ??= "conversation_smoke_3";
process.env.V3_VERIFY_MAX_TURNS ??= "3";

await import("./simulate_v3_worker_verification.ts");
