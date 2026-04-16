/**
 * Minimal DB fixtures for `v3_real_thread_replay_proof` high-risk scenarios (scripts only).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

async function createWedding(supabase: SupabaseClient, photographerId: string, label: string): Promise<string> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 6);
  const { data, error } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `V3 RTRP high-risk ${label}`,
      location: "Harness",
      wedding_date: weddingDate.toISOString(),
      stage: "prep",
      story_notes: "V3 real-thread replay proof — high-risk bundle",
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error("weddings insert: " + (error?.message ?? ""));
  return data.id as string;
}

async function createPerson(
  supabase: SupabaseClient,
  photographerId: string,
  displayName: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("people")
    .insert({
      photographer_id: photographerId,
      kind: "individual",
      display_name: displayName,
      canonical_name: displayName.toLowerCase().replace(/\s+/g, "_"),
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error("people insert: " + (error?.message ?? ""));
  return data.id as string;
}

export type V3HighRiskReplaySeed = {
  weddingId: string;
  authorityThreadId: string;
  brideConstraintMemoryId: string;
  plannerThreadId: string;
  plannerVerifyNoteMemoryId: string;
  mobPersonId: string;
  bridePersonId: string;
  plannerPersonId: string;
};

/**
 * One wedding, two threads:
 * - Authority stress: **planner** is thread sender (real `planner` authority bucket from graph);
 *   MOB remains **payer** and **CC** on-thread; bride **approval contact** + recipient — triangle in CRM, not via QA override.
 * - Planner pre-emption: planner sender thread + `v3_verify_case_note` memory.
 */
export async function seedV3HighRiskReplayBundle(
  supabase: SupabaseClient,
  photographerId: string,
  runId: string,
): Promise<V3HighRiskReplaySeed> {
  const weddingId = await createWedding(supabase, photographerId, runId);

  const mobPersonId = await createPerson(supabase, photographerId, `MOB RTRP ${runId}`);
  const bridePersonId = await createPerson(supabase, photographerId, `Bride RTRP ${runId}`);
  const plannerPersonId = await createPerson(supabase, photographerId, `Planner RTRP ${runId}`);

  const { error: wpErr } = await supabase.from("wedding_people").insert([
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: mobPersonId,
      role_label: "Mother of the bride",
      is_payer: true,
      is_primary_contact: false,
      is_approval_contact: false,
    },
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: bridePersonId,
      role_label: "Bride",
      is_payer: false,
      is_primary_contact: true,
      is_approval_contact: true,
    },
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: plannerPersonId,
      role_label: "Wedding planner",
      is_payer: false,
      is_primary_contact: false,
      is_approval_contact: false,
    },
  ]);
  if (wpErr) throw new Error("wedding_people insert: " + wpErr.message);

  const { data: thA, error: thAErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id: photographerId,
      title: `RTRP authority triangle ${runId}`,
      kind: "group",
    })
    .select("id")
    .single();
  if (thAErr || !thA?.id) throw new Error("threads insert (A): " + (thAErr?.message ?? ""));
  const authorityThreadId = thA.id as string;

  const { data: thB, error: thBErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id: photographerId,
      title: `RTRP planner verify-note ${runId}`,
      kind: "group",
    })
    .select("id")
    .single();
  if (thBErr || !thB?.id) throw new Error("threads insert (B): " + (thBErr?.message ?? ""));
  const plannerThreadId = thB.id as string;

  await supabase.from("thread_weddings").insert([
    {
      photographer_id: photographerId,
      thread_id: authorityThreadId,
      wedding_id: weddingId,
      relation: "primary",
    },
    {
      photographer_id: photographerId,
      thread_id: plannerThreadId,
      wedding_id: weddingId,
      relation: "primary",
    },
  ]);

  await supabase.from("thread_participants").insert([
    {
      photographer_id: photographerId,
      thread_id: authorityThreadId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: authorityThreadId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: authorityThreadId,
      person_id: mobPersonId,
      visibility_role: "mother of the bride",
      is_sender: false,
      is_recipient: false,
      is_cc: true,
    },
    {
      photographer_id: photographerId,
      thread_id: plannerThreadId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: plannerThreadId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: true,
    },
  ]);

  const { data: memA, error: mAErr } = await supabase
    .from("memories")
    .insert({
      photographer_id: photographerId,
      wedding_id: weddingId,
      type: "v3_rtrp_case_note",
      title: "Scheduling / package authority",
      summary: "Bride constraint on hour and package changes",
      full_content:
        "Lead note: Bride has asked us not to confirm schedule changes, extra coverage hours, or package edits without her written approval first. MOB pays invoices but is not the contract approval contact for package or schedule terms.",
    })
    .select("id")
    .single();
  if (mAErr || !memA?.id) throw new Error("memories insert (A): " + (mAErr?.message ?? ""));

  const { data: memB, error: mBErr } = await supabase
    .from("memories")
    .insert({
      photographer_id: photographerId,
      wedding_id: weddingId,
      type: "v3_verify_case_note",
      title: "Planner gallery access (verify)",
      summary: "Verbal access grant — needs confirmation",
      full_content:
        "Verify note: Client verbally said Planner Jane Smith may have full access to high-resolution delivery galleries and vendor packet assets for this booking. Still confirm in writing before sharing raw or full-res links externally.",
    })
    .select("id")
    .single();
  if (mBErr || !memB?.id) throw new Error("memories insert (B): " + (mBErr?.message ?? ""));

  return {
    weddingId,
    authorityThreadId,
    brideConstraintMemoryId: memA.id as string,
    plannerThreadId,
    plannerVerifyNoteMemoryId: memB.id as string,
    mobPersonId,
    bridePersonId,
    plannerPersonId,
  };
}

// ── V3 real-thread replay expansion (Cases A–J matrix) ────────────────────────────────────────

export type V3RtrpExpansionSeed = {
  weddingId: string;
  /** MOB sender → bride To — scope-creep / payer authority (Case A). */
  threadMobPayerId: string;
  /** Planner sender → bride To, groom CC — timeline cut / planner authority (Case B). */
  threadPlannerCcGroomBrideId: string;
  /** Bride sender → planner To — VIP payment question, ambiguous shift, discounts (Cases C, G, J). */
  threadBridePrimaryId: string;
  /** Planner sender → bride To — RAW / vendor policy (Case E). */
  threadPlannerPolicyId: string;
  /** Bride sender, planner To, MOB CC — mixed audience, book-now / starvation (Case I). */
  threadMixedAudienceId: string;
  mobPersonId: string;
  bridePersonId: string;
  groomPersonId: string;
  plannerPersonId: string;
};

/**
 * One wedding + five threads (no scenario-specific memories — verify-notes inserted/deleted per scenario in proof).
 * CRM `contract_value` is set for financial-existence without implying payment-term structure.
 */
export async function seedV3RtrpExpansionBundle(
  supabase: SupabaseClient,
  photographerId: string,
  runId: string,
): Promise<V3RtrpExpansionSeed> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 6);
  const { data: w, error: wErr } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `V3 RTRP expansion ${runId}`,
      location: "Replay City",
      wedding_date: weddingDate.toISOString(),
      stage: "prep",
      story_notes: "V3 real-thread replay expansion (A–J)",
      contract_value: 10000,
      balance_due: null,
    })
    .select("id")
    .single();
  if (wErr || !w?.id) throw new Error("weddings insert (expansion): " + (wErr?.message ?? ""));

  const weddingId = w.id as string;

  const mobPersonId = await createPerson(supabase, photographerId, `MOB RTRP-X ${runId}`);
  const bridePersonId = await createPerson(supabase, photographerId, `Bride RTRP-X ${runId}`);
  const groomPersonId = await createPerson(supabase, photographerId, `Groom RTRP-X ${runId}`);
  const plannerPersonId = await createPerson(supabase, photographerId, `Planner RTRP-X ${runId}`);

  const { error: wpErr } = await supabase.from("wedding_people").insert([
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: mobPersonId,
      role_label: "Mother of the bride",
      is_payer: true,
      is_primary_contact: false,
      is_approval_contact: false,
    },
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: bridePersonId,
      role_label: "Bride",
      is_payer: false,
      is_primary_contact: true,
      is_approval_contact: true,
    },
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: groomPersonId,
      role_label: "Groom",
      is_payer: false,
      is_primary_contact: false,
      is_approval_contact: false,
    },
    {
      photographer_id: photographerId,
      wedding_id: weddingId,
      person_id: plannerPersonId,
      role_label: "Wedding planner",
      is_payer: false,
      is_primary_contact: false,
      is_approval_contact: false,
    },
  ]);
  if (wpErr) throw new Error("wedding_people insert (expansion): " + wpErr.message);

  async function insertThread(title: string): Promise<string> {
    const { data: th, error: thErr } = await supabase
      .from("threads")
      .insert({
        wedding_id: weddingId,
        photographer_id: photographerId,
        title,
        kind: "group",
      })
      .select("id")
      .single();
    if (thErr || !th?.id) throw new Error("threads insert: " + (thErr?.message ?? ""));
    return th.id as string;
  }

  const threadMobPayerId = await insertThread(`RTRP-X mob payer ${runId}`);
  const threadPlannerCcGroomBrideId = await insertThread(`RTRP-X planner CC groom bride ${runId}`);
  const threadBridePrimaryId = await insertThread(`RTRP-X bride primary ${runId}`);
  const threadPlannerPolicyId = await insertThread(`RTRP-X planner policy ${runId}`);
  const threadMixedAudienceId = await insertThread(`RTRP-X mixed audience ${runId}`);

  for (const tid of [
    threadMobPayerId,
    threadPlannerCcGroomBrideId,
    threadBridePrimaryId,
    threadPlannerPolicyId,
    threadMixedAudienceId,
  ]) {
    await supabase.from("thread_weddings").insert({
      photographer_id: photographerId,
      thread_id: tid,
      wedding_id: weddingId,
      relation: "primary",
    });
  }

  await supabase.from("thread_participants").insert([
    // Case A — MOB sender
    {
      photographer_id: photographerId,
      thread_id: threadMobPayerId,
      person_id: mobPersonId,
      visibility_role: "mother of the bride",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadMobPayerId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    // Case B — planner sender, bride To, groom CC
    {
      photographer_id: photographerId,
      thread_id: threadPlannerCcGroomBrideId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadPlannerCcGroomBrideId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadPlannerCcGroomBrideId,
      person_id: groomPersonId,
      visibility_role: "groom",
      is_sender: false,
      is_recipient: false,
      is_cc: true,
    },
    // Cases C, G — bride sender
    {
      photographer_id: photographerId,
      thread_id: threadBridePrimaryId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadBridePrimaryId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    // Case E — planner sender
    {
      photographer_id: photographerId,
      thread_id: threadPlannerPolicyId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadPlannerPolicyId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    // Case I — mixed — bride sender, planner To, MOB CC
    {
      photographer_id: photographerId,
      thread_id: threadMixedAudienceId,
      person_id: bridePersonId,
      visibility_role: "bride",
      is_sender: true,
      is_recipient: false,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadMixedAudienceId,
      person_id: plannerPersonId,
      visibility_role: "wedding planner",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    },
    {
      photographer_id: photographerId,
      thread_id: threadMixedAudienceId,
      person_id: mobPersonId,
      visibility_role: "mother of the bride",
      is_sender: false,
      is_recipient: false,
      is_cc: true,
    },
  ]);

  return {
    weddingId,
    threadMobPayerId,
    threadPlannerCcGroomBrideId,
    threadBridePrimaryId,
    threadPlannerPolicyId,
    threadMixedAudienceId,
    mobPersonId,
    bridePersonId,
    groomPersonId,
    plannerPersonId,
  };
}

export async function cleanupV3RtrpExpansionBundle(supabase: SupabaseClient, seed: V3RtrpExpansionSeed): Promise<void> {
  const { weddingId } = seed;
  const threads = [
    seed.threadMobPayerId,
    seed.threadPlannerCcGroomBrideId,
    seed.threadBridePrimaryId,
    seed.threadPlannerPolicyId,
    seed.threadMixedAudienceId,
  ];
  for (const tid of threads) {
    await supabase.from("thread_summaries").delete().eq("thread_id", tid);
    await supabase.from("thread_participants").delete().eq("thread_id", tid);
    await supabase.from("thread_weddings").delete().eq("thread_id", tid);
    await supabase.from("threads").delete().eq("id", tid);
  }
  await supabase.from("wedding_people").delete().eq("wedding_id", weddingId);
  await supabase.from("weddings").delete().eq("id", weddingId);
  await supabase
    .from("people")
    .delete()
    .in("id", [seed.mobPersonId, seed.bridePersonId, seed.groomPersonId, seed.plannerPersonId]);
}

export async function cleanupV3HighRiskReplayBundle(
  supabase: SupabaseClient,
  seed: V3HighRiskReplaySeed,
): Promise<void> {
  const { weddingId, authorityThreadId, plannerThreadId, brideConstraintMemoryId, plannerVerifyNoteMemoryId } =
    seed;
  await supabase.from("memories").delete().in("id", [brideConstraintMemoryId, plannerVerifyNoteMemoryId]);
  for (const tid of [authorityThreadId, plannerThreadId]) {
    await supabase.from("thread_summaries").delete().eq("thread_id", tid);
    await supabase.from("thread_participants").delete().eq("thread_id", tid);
    await supabase.from("thread_weddings").delete().eq("thread_id", tid);
    await supabase.from("threads").delete().eq("id", tid);
  }
  await supabase.from("wedding_people").delete().eq("wedding_id", weddingId);
  await supabase.from("weddings").delete().eq("id", weddingId);
  await supabase.from("people").delete().in("id", [seed.mobPersonId, seed.bridePersonId, seed.plannerPersonId]);
}
