/**
 * Outbound Worker — Send & Record.
 *
 * Step 9C: approval body edits (vs original draft) are captured as `memories` learning inputs — not playbook_rules.
 *
 * Listens for approval/draft.approved.
 *
 * 1. Atomically claim the draft (pending_approval -> approved) with tenant proof via
 *    `claim_draft_for_outbound` (drafts.thread_id -> threads.photographer_id). If 0 rows,
 *    another approval already consumed this draft — skip send (double-click safe).
 * 2. Execute outbound delivery (mock / Twilio — only after claim succeeds).
 * 3. Record the sent message in the messages table.
 */
import { captureDraftLearningInput } from "../../_shared/captureDraftLearningInput.ts";
import { sendGmailReplyForApprovedDraft } from "../../_shared/gmail/gmailOperatorSend.ts";
import { inngest } from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";

type ClaimedDraft = {
  id: string;
  thread_id: string;
  body: string;
};

export const outboundFunction = inngest.createFunction(
  { id: "outbound-worker", name: "Outbound Worker — Send & Record" },
  { event: "approval/draft.approved" },
  async ({ event, step }) => {
    const { draft_id, photographer_id, edited_body } = event.data;

    const approvalEditLearning = await step.run("load-approval-edit-learning-context", async () => {
      const eb = typeof edited_body === "string" ? edited_body.trim() : "";
      if (!eb) return null;

      const { data, error } = await supabaseAdmin
        .from("drafts")
        .select("body, photographer_id, threads(wedding_id)")
        .eq("id", draft_id)
        .eq("photographer_id", photographer_id)
        .maybeSingle();

      if (error || !data) return null;

      const orig = (data.body as string) ?? "";
      if (orig.trim() === eb) return null;

      const threads = data.threads as { wedding_id: string | null } | null;
      return {
        originalBody: orig,
        editedBody: eb,
        weddingId: threads?.wedding_id ?? null,
      };
    });

    const claimed = await step.run("claim-draft-atomic", async () => {
      const { data, error } = await supabaseAdmin.rpc("claim_draft_for_outbound", {
        p_draft_id: draft_id,
        p_photographer_id: photographer_id,
        p_edited_body: edited_body ?? null,
      });

      if (error) {
        throw new Error(`claim_draft_for_outbound: ${error.message}`);
      }

      const rows = (data ?? []) as ClaimedDraft[];
      return rows[0] ?? null;
    });

    if (!claimed) {
      console.log(
        `[outbound] Skipping send for draft ${draft_id}: no row claimed (already approved, wrong tenant, or not pending).`,
      );
      return {
        status: "skipped",
        draft_id,
        reason: "no_atomic_claim",
      };
    }

    const draft: ClaimedDraft = claimed;

    if (approvalEditLearning) {
      await step.run("capture-draft-approval-edit-learning", async () => {
        await captureDraftLearningInput(supabaseAdmin, {
          channel: "approval_edit",
          photographerId: photographer_id,
          weddingId: approvalEditLearning.weddingId,
          draftId: draft_id,
          originalBody: approvalEditLearning.originalBody,
          editedBody: approvalEditLearning.editedBody,
        });
      });
    }

    const gmailResult = await step.run("execute-send-gmail-or-fallback", async () => {
      const gmail = await sendGmailReplyForApprovedDraft(supabaseAdmin, {
        photographerId: photographer_id,
        threadId: draft.thread_id,
        body: draft.body,
      });
      if (gmail.ok) {
        /**
         * `sendGmailReplyForApprovedDraft` already persists an outbound `messages` row via
         * `sendGmailReplyAndInsertMessage` (provider_message_id + idempotency_key = Gmail id).
         * Do not insert again here — avoids duplicate rows when sync backfills the same send.
         */
        return { kind: "gmail" as const, gmailMessageId: gmail.gmailMessageId };
      }
      if (!gmail.skip) {
        throw new Error(gmail.error);
      }
      console.log(
        `[MOCK SEND] Non-Gmail or unsupported path for thread ${draft.thread_id} (draft ${draft.id}) — ${gmail.error}`,
      );
      return { kind: "mock" as const };
    });

    if (gmailResult.kind === "mock") {
      await step.run("record-message-mock", async () => {
        const { error } = await supabaseAdmin.from("messages").insert({
          thread_id: draft.thread_id,
          photographer_id,
          direction: "out",
          sender: "photographer",
          body: draft.body,
        });

        if (error) {
          throw new Error(`Failed to record outbound message: ${error.message}`);
        }
      });
    }

    return {
      status: gmailResult.kind === "gmail" ? "sent_gmail" : "sent_and_recorded",
      draft_id: draft.id,
      thread_id: draft.thread_id,
      ...(gmailResult.kind === "gmail" ? { gmail_message_id: gmailResult.gmailMessageId } : {}),
    };
  },
);
