/**
 * Phase 12A — one-time backfill: current `photographers.settings` contract
 * → `playbook_rules` (`studio_settings_contract`).
 *
 * Usage (service role required):
 *   npx tsx scripts/backfill-step12a-settings-to-playbook.ts
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { parsePhotographerSettings } from "../src/lib/photographerSettings.ts";
import {
  ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
  buildStudioSettingsContractPlaybookRule,
} from "../src/lib/backfillPhotographerSettingsToPlaybook.ts";

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: photographers, error: listErr } = await supabase
    .from("photographers")
    .select("id, settings");

  if (listErr) {
    console.error("List photographers:", listErr.message);
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let skippedNoData = 0;

  for (const row of photographers ?? []) {
    const id = row.id as string;
    const raw =
      row.settings && typeof row.settings === "object" && !Array.isArray(row.settings)
        ? (row.settings as Record<string, unknown>)
        : {};
    const contract = parsePhotographerSettings(raw);

    const insert = buildStudioSettingsContractPlaybookRule(id, contract);
    if (!insert) {
      skippedNoData += 1;
      continue;
    }

    const { data: existing, error: exErr } = await supabase
      .from("playbook_rules")
      .select("id")
      .eq("photographer_id", id)
      .eq("action_key", ACTION_KEY_STUDIO_SETTINGS_CONTRACT)
      .maybeSingle();

    if (exErr) {
      console.error(`Check existing for ${id}:`, exErr.message);
      process.exit(1);
    }

    if (existing) {
      skipped += 1;
      continue;
    }

    const { error: insErr } = await supabase.from("playbook_rules").insert(insert);
    if (insErr) {
      console.error(`Insert for ${id}:`, insErr.message);
      process.exit(1);
    }
    inserted += 1;
  }

  console.log(
    JSON.stringify(
      {
        step: "12A",
        target: "playbook_rules",
        action_key: ACTION_KEY_STUDIO_SETTINGS_CONTRACT,
        inserted,
        skipped_already_present: skipped,
        skipped_no_contract_fields: skippedNoData,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
