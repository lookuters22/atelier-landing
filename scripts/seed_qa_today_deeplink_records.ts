/**
 * Inserts real QA rows for Today deep-link manual testing (inquiry / task / escalation).
 * Uses SUPABASE_SERVICE_ROLE_KEY from .env (bypasses RLS). Does not use WhatsApp for threads — channel=email.
 *
 * Usage:
 *   npx tsx scripts/seed_qa_today_deeplink_records.ts [photographer-uuid]
 *
 * If omitted, uses QA_PHOTOGRAPHER_ID env, else the only auth user, else exits with a list of users.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(): void {
  try {
    const p = resolve(process.cwd(), ".env");
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

const QA_TITLE_INQUIRY = "QA Today inquiry — email intake (manual seed)";
const QA_TITLE_TASK = "QA Today task — wedding-linked open task";
const QA_BODY_ESCALATION = "QA Today escalation — operator-blocked seed for Today deep-link QA";

async function main() {
  loadDotEnv();
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const argPid = process.argv[2]?.trim();
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let photographerId = argPid || process.env.QA_PHOTOGRAPHER_ID?.trim() || "";

  if (!photographerId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      console.error("auth.admin.listUsers:", error.message);
      process.exit(1);
    }
    const users = data.users ?? [];
    if (users.length === 0) {
      console.error("No auth users. Create a user or pass photographer UUID.");
      process.exit(1);
    }
    if (users.length > 1) {
      console.error(
        "Multiple auth users — pass photographer UUID explicitly:\n  npx tsx scripts/seed_qa_today_deeplink_records.ts <uuid>\n\nUsers:",
      );
      for (const u of users) {
        console.error(`  ${u.id}  ${u.email ?? ""}`);
      }
      process.exit(1);
    }
    photographerId = users[0].id;
    console.log("Using sole auth user as photographer_id:", photographerId);
  }

  const { data: weddingRow, error: wErr } = await supabase
    .from("weddings")
    .select("id, couple_names")
    .eq("photographer_id", photographerId)
    .neq("stage", "archived")
    .order("couple_names", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (wErr || !weddingRow?.id) {
    console.error(
      "Need at least one non-archived wedding for this photographer to seed the task. Error:",
      wErr?.message ?? "no row",
    );
    process.exit(1);
  }
  const weddingId = weddingRow.id as string;

  const now = new Date().toISOString();

  // 1) Unfiled inquiry thread — channel email (not WhatsApp)
  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .insert({
      photographer_id: photographerId,
      wedding_id: null,
      title: QA_TITLE_INQUIRY,
      kind: "group",
      channel: "email",
      last_activity_at: now,
      status: "open",
    })
    .select("id")
    .single();

  if (tErr || !thread) {
    console.error("threads insert:", tErr?.message);
    process.exit(1);
  }
  const threadId = thread.id as string;

  const { error: mErr } = await supabase.from("messages").insert({
    thread_id: threadId,
    photographer_id: photographerId,
    direction: "in",
    sender: "qa.client@example.com",
    body: "QA Today inquiry — inbound email body (not WhatsApp).",
    sent_at: now,
  });
  if (mErr) {
    console.error("messages insert:", mErr.message);
    process.exit(1);
  }

  // 2) Open task (wedding-linked)
  const due = new Date();
  due.setDate(due.getDate() + 1);
  const { data: taskRow, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      photographer_id: photographerId,
      wedding_id: weddingId,
      title: QA_TITLE_TASK,
      due_date: due.toISOString(),
      status: "open",
    })
    .select("id")
    .single();

  if (taskErr || !taskRow) {
    console.error("tasks insert:", taskErr?.message);
    process.exit(1);
  }
  const taskId = taskRow.id as string;

  // 3) Open escalation
  const { data: escRow, error: escErr } = await supabase
    .from("escalation_requests")
    .insert({
      photographer_id: photographerId,
      wedding_id: weddingId,
      action_key: "operator_blocked_action",
      reason_code: "qa_today_seed",
      decision_justification: { qa: true, source: "seed_qa_today_deeplink_records" },
      question_body: QA_BODY_ESCALATION,
      status: "open",
      operator_delivery: "urgent_now",
    })
    .select("id")
    .single();

  if (escErr || !escRow) {
    console.error("escalation_requests insert:", escErr?.message);
    process.exit(1);
  }
  const escalationId = escRow.id as string;

  // Verify (filters aligned with useUnfiledInbox / useTasks / useOpenEscalations)
  const { data: inquiryCheck } = await supabase
    .from("threads")
    .select("id, title")
    .is("wedding_id", null)
    .eq("photographer_id", photographerId)
    .neq("kind", "other")
    .eq("id", threadId)
    .maybeSingle();

  const { data: taskCheck } = await supabase
    .from("tasks")
    .select("id, title, wedding_id")
    .eq("status", "open")
    .eq("id", taskId)
    .maybeSingle();

  const { data: escCheck } = await supabase
    .from("escalation_requests")
    .select("id, question_body")
    .eq("photographer_id", photographerId)
    .eq("status", "open")
    .eq("id", escalationId)
    .maybeSingle();

  console.log("\n--- QA seed complete ---");
  console.log("photographer_id:", photographerId);
  console.log("wedding_id (task + escalation):", weddingId);
  console.log("\nInquiry (unfiled thread):");
  console.log("  table: threads + messages");
  console.log("  thread_id:", threadId);
  console.log("  title:", QA_TITLE_INQUIRY);
  console.log("  hook-style verify:", inquiryCheck ? "ok" : "missing");

  console.log("\nTask:");
  console.log("  table: tasks");
  console.log("  task_id:", taskId);
  console.log("  title:", QA_TITLE_TASK);
  console.log("  verify:", taskCheck ? "ok" : "missing");

  console.log("\nEscalation:");
  console.log("  table: escalation_requests");
  console.log("  escalation_id:", escalationId);
  console.log("  question_body:", QA_BODY_ESCALATION);
  console.log("  verify:", escCheck ? "ok" : "missing");

  console.log("\nRefresh Today in the app (logged in as this photographer) to see all three actions.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
