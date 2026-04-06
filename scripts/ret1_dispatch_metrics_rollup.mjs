#!/usr/bin/env node
/**
 * RET1b — aggregate `[triage.retirement_dispatch_v1]` log lines into readiness counts.
 *
 * Input: text containing lines with `[triage.retirement_dispatch_v1] {json}` (Supabase Edge / Inngest export),
 * or one JSON object per line (NDJSON) matching `RetirementDispatchObservabilityV1`.
 *
 * Usage:
 *   node scripts/ret1_dispatch_metrics_rollup.mjs path/to/export.log
 *   Get-Content export.log | node scripts/ret1_dispatch_metrics_rollup.mjs
 *   node scripts/ret1_dispatch_metrics_rollup.mjs   # stdin
 *
 * Docs: docs/v3/LEGACY_EMAIL_WEB_INTENT_RETIREMENT_SEQUENCE.md §5.5
 */
import { readFileSync, existsSync } from "fs";

const MARKER = "[triage.retirement_dispatch_v1]";

function parseRecordFromLine(line) {
  const t = line.trim();
  if (!t) return null;
  const i = t.indexOf(MARKER);
  if (i !== -1) {
    const rest = t.slice(i + MARKER.length).trim();
    try {
      return JSON.parse(rest);
    } catch {
      return null;
    }
  }
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return null;
}

function inc(map, key) {
  const k = key ?? "(missing)";
  map.set(k, (map.get(k) ?? 0) + 1);
}

function sortEntries(map) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function printTable(title, map) {
  console.log(`\n--- ${title} ---`);
  if (map.size === 0) {
    console.log("(no rows)");
    return;
  }
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  const w = Math.max(...[...map.keys()].map((k) => String(k).length), 8);
  for (const [k, v] of sortEntries(map)) {
    console.log(String(k).padEnd(w + 2) + String(v));
  }
  console.log("Sum: " + sum);
}

function rollup(records) {
  const byLane = new Map();
  const byBranch = new Map();
  const byDownstream = new Map();
  const byIntent = new Map();
  let rollbackTrue = 0;
  let rollbackFalse = 0;
  const legacyDownstream = new Map(); // ai/intent.* only
  const orchLiveByBranch = new Map();

  for (const r of records) {
    if (!r || typeof r !== "object") continue;
    inc(byLane, r.lane);
    inc(byBranch, r.branch_code);
    inc(byDownstream, r.downstream_inngest_event);
    inc(byIntent, r.dispatch_intent);
    if (r.rollback_capable === true) rollbackTrue++;
    else rollbackFalse++;

    const d = r.downstream_inngest_event;
    if (typeof d === "string" && d.startsWith("ai/intent.")) {
      inc(legacyDownstream, d);
    }
    if (r.lane === "orchestrator_client_v1_live" && r.branch_code) {
      inc(orchLiveByBranch, r.branch_code);
    }
  }

  return {
    byLane,
    byBranch,
    byDownstream,
    byIntent,
    rollbackTrue,
    rollbackFalse,
    legacyDownstream,
    orchLiveByBranch,
    n: records.length,
  };
}

function printHints(r) {
  console.log("\n--- Readiness hints (heuristic, not automatic D1) ---");
  const total = r.n || 1;
  const rbPct = ((r.rollbackTrue / total) * 100).toFixed(1);
  console.log(
    `rollback_capable: ${r.rollbackTrue} true / ${r.rollbackFalse} false (${rbPct}% of rows could have been orchestrator live if the matching CUT gate were on).`,
  );

  const orch = r.byLane.get("orchestrator_client_v1_live") ?? 0;
  const leg = r.byLane.get("legacy_ai_intent") ?? 0;
  const cut2D1Blocked = r.byLane.get("cut2_web_widget_d1_blocked_no_dispatch") ?? 0;
  if (cut2D1Blocked > 0) {
    console.log(
      `cut2_web_widget_d1_blocked_no_dispatch: ${cut2D1Blocked} (CUT2 off + D1 legacy disallowed — no ai/intent.concierge).`,
    );
  }
  const cut4D1Blocked = r.byLane.get("cut4_main_path_concierge_d1_blocked_no_dispatch") ?? 0;
  if (cut4D1Blocked > 0) {
    console.log(
      `cut4_main_path_concierge_d1_blocked_no_dispatch: ${cut4D1Blocked} (CUT4 off + D1 legacy disallowed — no main-path concierge).`,
    );
  }
  if (orch + leg > 0) {
    console.log(
      `legacy_ai_intent vs orchestrator_client_v1_live: ${leg} vs ${orch} (compare before defaulting CUT gates on).`,
    );
  }

  const topLegacy = sortEntries(r.legacyDownstream).slice(0, 5);
  if (topLegacy.length) {
    console.log("Most frequent legacy downstream events (ai/intent.*):");
    topLegacy.forEach(([ev, c]) => console.log(`  ${ev}: ${c}`));
  }

  const topOrch = sortEntries(r.orchLiveByBranch).slice(0, 5);
  if (topOrch.length) {
    console.log("Orchestrator live traffic by branch_code:");
    topOrch.forEach(([b, c]) => console.log(`  ${b}: ${c}`));
  }

  console.log("\nClosest to retirement (directional):");
  if (orch > leg && orch > 0) {
    console.log("  Orchestrator live already leads for this sample — next step is ops sign-off + D1 criteria, not more code.");
  } else if (r.rollbackTrue > r.rollbackFalse && r.rollbackTrue > 0) {
    console.log("  Many rollback_capable rows — specialist legacy is often gate-off only; enabling CUT* envs may shift volume without new routing code.");
  } else if ((r.byLane.get("legacy_ai_intent") ?? 0) > 0 && (r.rollbackTrue ?? 0) === 0) {
    console.log("  Legacy volume without rollback_capable — often intake, no known wedding, or intents without a matching CUT; orchestrator cutover is a separate parity slice.");
  } else {
    console.log("  Insufficient pattern in this sample — collect a longer window or stratify by tenant.");
  }
}

async function readAllInput(argv) {
  const filePath = argv[2];
  if (filePath && filePath !== "-") {
    if (!existsSync(filePath)) {
      console.error("File not found:", filePath);
      process.exit(1);
    }
    return readFileSync(filePath, "utf8");
  }
  const chunks = [];
  for await (const ch of process.stdin) chunks.push(ch);
  return Buffer.concat(chunks).toString("utf8");
}

const text = await readAllInput(process.argv);
const lines = text.split(/\r?\n/);
const records = [];
for (const line of lines) {
  const rec = parseRecordFromLine(line);
  if (rec && (rec.schema_version === 1 || rec.lane)) records.push(rec);
}

if (records.length === 0) {
  console.error("No RET1 records found. Paste lines containing `[triage.retirement_dispatch_v1]` JSON.");
  process.exit(2);
}

const r = rollup(records);
console.log(`Parsed ${records.length} RET1 record(s).\n`);

printTable("lane", r.byLane);
printTable("branch_code", r.byBranch);
printTable("downstream_inngest_event", r.byDownstream);
printTable("dispatch_intent", r.byIntent);
printTable("legacy downstream (ai/intent.* only)", r.legacyDownstream);

console.log("\n--- rollback_capable ---");
console.log(`true:  ${r.rollbackTrue}`);
console.log(`false: ${r.rollbackFalse}`);

printHints(r);

console.log("\n--- JSON summary (pipe to jq if needed) ---");
console.log(
  JSON.stringify(
    {
      total_records: r.n,
      lane: Object.fromEntries(r.byLane),
      branch_code: Object.fromEntries(r.byBranch),
      downstream_inngest_event: Object.fromEntries(r.byDownstream),
      rollback_capable_true: r.rollbackTrue,
      rollback_capable_false: r.rollbackFalse,
    },
    null,
    2,
  ),
);
