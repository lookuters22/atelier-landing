/**
 * Shared DB seed for RBAC harness + Inngest hosted proofs (no supabase/functions `npm:` imports).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY } from "../supabase/functions/_shared/qa/stressTestAudienceFixtures.ts";

const STRESS7_MEMORY_BODY = STRESS_TEST_RBAC_LIVE_HARNESS_MEMORY;

/** Live DB scenarios: ST7 baseline + ST5 agency/direct + ST8 merge/unknown shapes. */
export type RbacHarnessCaseId =
  | "st7_planner_only"
  | "st7_client_visible"
  | "st7_mixed_audience"
  | "st5_agency_cc_mixed"
  | "st5_agency_internal_only"
  | "st5_direct_client"
  | "st8_planner_groom_mixed"
  | "st8_planner_unknown_outreach";

async function createWedding(supabase: SupabaseClient, photographerId: string, label: string): Promise<string> {
  const weddingDate = new Date();
  weddingDate.setMonth(weddingDate.getMonth() + 6);
  const { data, error } = await supabase
    .from("weddings")
    .insert({
      photographer_id: photographerId,
      couple_names: `RBAC proof ${label}`,
      location: "Harness",
      wedding_date: weddingDate.toISOString(),
      stage: "prep",
      story_notes: `V3 RBAC audience proof ${label}`,
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

export async function seedRbacHarnessCase(
  supabase: SupabaseClient,
  photographerId: string,
  caseId: RbacHarnessCaseId,
  runId: string,
): Promise<{ weddingId: string; threadId: string; memoryId: string; personIds: string[] }> {
  const weddingId = await createWedding(supabase, photographerId, `${caseId}-${runId}`);

  const pPlanner = await createPerson(supabase, photographerId, `Planner ${caseId} ${runId}`);
  const pClient = await createPerson(supabase, photographerId, `Client ${caseId} ${runId}`);

  const wp: Array<{
    photographer_id: string;
    wedding_id: string;
    person_id: string;
    role_label: string;
    is_payer: boolean;
  }> = [];

  switch (caseId) {
    case "st7_planner_only":
    case "st5_agency_internal_only":
      wp.push(
        {
          photographer_id: photographerId,
          wedding_id: weddingId,
          person_id: pPlanner,
          role_label: "Wedding planner",
          is_payer: false,
        },
        {
          photographer_id: photographerId,
          wedding_id: weddingId,
          person_id: pClient,
          role_label: "Coordinator",
          is_payer: false,
        },
      );
      break;
    case "st7_client_visible":
    case "st5_direct_client":
      wp.push({
        photographer_id: photographerId,
        wedding_id: weddingId,
        person_id: pPlanner,
        role_label: "Bride",
        is_payer: false,
      });
      break;
    case "st7_mixed_audience":
    case "st5_agency_cc_mixed":
    case "st8_planner_groom_mixed":
      wp.push(
        {
          photographer_id: photographerId,
          wedding_id: weddingId,
          person_id: pPlanner,
          role_label: "Wedding planner",
          is_payer: false,
        },
        {
          photographer_id: photographerId,
          wedding_id: weddingId,
          person_id: pClient,
          role_label: "Groom",
          is_payer: false,
        },
      );
      break;
    case "st8_planner_unknown_outreach":
      wp.push({
        photographer_id: photographerId,
        wedding_id: weddingId,
        person_id: pPlanner,
        role_label: "Wedding planner",
        is_payer: false,
      });
      break;
    default:
      throw new Error(`seedRbacHarnessCase: unhandled ${caseId}`);
  }

  const { error: wpErr } = await supabase.from("wedding_people").insert(wp);
  if (wpErr) throw new Error("wedding_people insert: " + wpErr.message);

  const { data: th, error: thErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id: photographerId,
      title: `RBAC proof ${caseId} ${runId}`,
      kind: "group",
    })
    .select("id")
    .single();
  if (thErr || !th?.id) throw new Error("threads insert: " + (thErr?.message ?? ""));
  const threadId = th.id as string;

  await supabase.from("thread_weddings").insert({
    photographer_id: photographerId,
    thread_id: threadId,
    wedding_id: weddingId,
    relation: "primary",
  });

  if (caseId === "st7_planner_only" || caseId === "st5_agency_internal_only") {
    await supabase.from("thread_participants").insert([
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pPlanner,
        visibility_role: "wedding planner",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pClient,
        visibility_role: "coordinator",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
    ]);
  } else if (caseId === "st7_client_visible" || caseId === "st5_direct_client") {
    await supabase.from("thread_participants").insert({
      photographer_id: photographerId,
      thread_id: threadId,
      person_id: pPlanner,
      visibility_role: "bride",
      is_sender: false,
      is_recipient: true,
      is_cc: false,
    });
  } else if (caseId === "st7_mixed_audience" || caseId === "st5_agency_cc_mixed") {
    await supabase.from("thread_participants").insert([
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pPlanner,
        visibility_role: "wedding planner",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pClient,
        visibility_role: "bride",
        is_sender: false,
        is_recipient: true,
        is_cc: true,
      },
    ]);
  } else if (caseId === "st8_planner_groom_mixed") {
    await supabase.from("thread_participants").insert([
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pPlanner,
        visibility_role: "wedding planner",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pClient,
        visibility_role: "groom",
        is_sender: false,
        is_recipient: true,
        is_cc: true,
      },
    ]);
  } else if (caseId === "st8_planner_unknown_outreach") {
    await supabase.from("thread_participants").insert([
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pPlanner,
        visibility_role: "wedding planner",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
      {
        photographer_id: photographerId,
        thread_id: threadId,
        person_id: pClient,
        visibility_role: "",
        is_sender: false,
        is_recipient: true,
        is_cc: false,
      },
    ]);
  }

  const { data: mem, error: mErr } = await supabase
    .from("memories")
    .insert({
      photographer_id: photographerId,
      wedding_id: weddingId,
      scope: "project",
      type: "v3_rbac_proof",
      title: `RBAC ${caseId}`,
      summary: "Private commercial notes (harness)",
      full_content: STRESS7_MEMORY_BODY,
    })
    .select("id")
    .single();
  if (mErr || !mem?.id) throw new Error("memories insert: " + (mErr?.message ?? ""));

  return { weddingId, threadId, memoryId: mem.id as string, personIds: [pPlanner, pClient] };
}

/** Best-effort cleanup: delete wedding (may fail if FK); then targeted rows. */
export async function cleanupCaseLoose(
  supabase: SupabaseClient,
  weddingId: string,
  threadId: string,
  memoryId: string,
  personIds: string[],
): Promise<void> {
  await supabase.from("memories").delete().eq("id", memoryId);
  await supabase.from("thread_summaries").delete().eq("thread_id", threadId);
  await supabase.from("thread_participants").delete().eq("thread_id", threadId);
  await supabase.from("thread_weddings").delete().eq("thread_id", threadId);
  await supabase.from("threads").delete().eq("id", threadId);
  await supabase.from("wedding_people").delete().eq("wedding_id", weddingId);
  await supabase.from("weddings").delete().eq("id", weddingId);
  if (personIds.length > 0) {
    await supabase.from("people").delete().in("id", personIds);
  }
}
