/**
 * QA / harness: persist canonical `threads` + inbound `messages`, then enqueue
 * `inbox/thread.requires_triage.v1` (live primary email classification path).
 *
 * **Historical:** older scripts sent `comms/email.received` to removed `traffic-cop-triage`.
 * Do not use retired event names for new harnesses.
 *
 * @param {object} p
 * @param {import("@supabase/supabase-js").SupabaseClient} p.supabase
 * @param {string} p.photographerId
 * @param {string | null} p.weddingId
 * @param {string} p.senderEmail
 * @param {string} p.subject
 * @param {string} p.body
 * @param {string} p.inngestKey
 * @param {string} [p.traceId]
 * @param {"manual" | "gmail_delta"} [p.source]
 * @param {Record<string, unknown> | null} [p.messageMetadata]
 */
export async function enqueueInboxThreadRequiresTriageV1(p) {
  const {
    supabase,
    photographerId,
    weddingId,
    senderEmail,
    subject,
    body,
    inngestKey,
    traceId,
    source = "manual",
    messageMetadata = null,
  } = p;

  const title = subject.length > 0 ? subject.slice(0, 200) : "inbound";
  const { data: threadRow, error: tErr } = await supabase
    .from("threads")
    .insert({
      wedding_id: weddingId,
      photographer_id: photographerId,
      title,
      kind: "group",
    })
    .select("id")
    .single();
  if (tErr) throw tErr;

  const msgRowPayload = {
    thread_id: threadRow.id,
    photographer_id: photographerId,
    direction: "in",
    sender: senderEmail,
    body,
    ...(messageMetadata && typeof messageMetadata === "object" ? { metadata: messageMetadata } : {}),
  };
  const { data: msgRow, error: mErr } = await supabase.from("messages").insert(msgRowPayload).select("id").single();
  if (mErr) throw mErr;

  const ingestUrl = "https://inn.gs/e/" + encodeURIComponent(inngestKey);
  const event = {
    name: "inbox/thread.requires_triage.v1",
    data: {
      schemaVersion: 1,
      photographerId,
      threadId: threadRow.id,
      triggerMessageId: msgRow.id,
      source,
      traceId: traceId ?? `harness-${Date.now()}`,
    },
  };
  const res = await fetch(ingestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([event]),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Inngest send failed ${res.status}: ${text}`);

  let inngestEventId = null;
  try {
    inngestEventId = JSON.parse(text).ids?.[0] ?? null;
  } catch {
    /* */
  }
  return { threadId: threadRow.id, messageId: msgRow.id, sendText: text, inngestEventId };
}
