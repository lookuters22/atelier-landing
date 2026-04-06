/**
 * One-command strict live-V3 smoke: 1 turn, `strict_lifecycle` gate mode.
 * Requires `scripts/v3_verify_gate_posture.env` (copy from `v3_verify_gate_posture.env.example`)
 * so preflight sees CUT4–CUT8 = on.
 *
 * Run: `npm run v3:verify-smoke-strict`
 */
process.env.V3_VERIFY_OPERATOR_PROFILE ??= "smoke_strict";
process.env.V3_VERIFY_MAX_TURNS ??= "1";
process.env.V3_VERIFY_GATE_MODE ??= "strict_lifecycle";

await import("./simulate_v3_worker_verification.ts");
