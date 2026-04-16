/**
 * Intake extraction + post-bootstrap downstream for canonical inbound threads (Gmail / manual convert).
 * Listens for `ai/intent.intake.existing_thread.v1` — wedding + thread already exist; no duplicate rows.
 */
import {
  AI_INTENT_INTAKE_EXISTING_THREAD_V1_EVENT,
  inngest,
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { runIntakeExtractionAndResearch } from "../../_shared/intake/intakeBootstrapBoundary.ts";
import { isIntakeLiveOrchestratorPostBootstrapEmailEnabled } from "../../_shared/intake/intakeLivePostBootstrapOrchestratorGate.ts";
import { isIntakeLiveOrchestratorPostBootstrapWebEnabled } from "../../_shared/intake/intakeLivePostBootstrapOrchestratorWebGate.ts";
import { isIntakeShadowOrchestratorPostBootstrapEnabled } from "../../_shared/intake/intakePostBootstrapOrchestratorGate.ts";

function intakeReplyChannelForOrchestratorParity(
  reply_channel: string | undefined,
): "email" | "web" | null {
  if (reply_channel === "web") return "web";
  if (reply_channel === "whatsapp") return null;
  return "email";
}

function intakeOrchestratorInboundSender(senderEmail: string | undefined): { inboundSenderEmail?: string } {
  if (typeof senderEmail !== "string") return {};
  const t = senderEmail.trim();
  if (!t.includes("@")) return {};
  return { inboundSenderEmail: t };
}

/** Same date coercion contract as `createIntakeLeadRecords`. */
function coerceWeddingDateForUpdate(value: string | null | undefined): string | undefined {
  if (value == null || !String(value).trim()) return undefined;
  const t = String(value).trim();
  if (t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return undefined;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

function coerceOptionalEventDateForUpdate(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null || !String(value).trim()) return null;
  const t = String(value).trim();
  if (t.toLowerCase() === "null" || t.toLowerCase() === "undefined") return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

export const intakeExistingThreadFunction = inngest.createFunction(
  { id: "intake-existing-thread-worker", name: "Intake — existing canonical thread (no duplicate CRM rows)" },
  { event: AI_INTENT_INTAKE_EXISTING_THREAD_V1_EVENT },
  async ({ event, step }) => {
    const {
      photographerId,
      weddingId,
      threadId,
      raw_message,
      sender_email,
      reply_channel,
    } = event.data;

    const extraction = await step.run("extract-and-research", async () =>
      runIntakeExtractionAndResearch(raw_message),
    );

    await step.run("merge-extraction-into-wedding", async () => {
      const patch: Record<string, unknown> = {};
      if (extraction.couple_names?.trim()) {
        patch.couple_names = extraction.couple_names.trim().slice(0, 500);
      }
      const wd = coerceWeddingDateForUpdate(extraction.wedding_date);
      if (wd) patch.wedding_date = wd;

      const dateSignal =
        extraction.wedding_date != null ||
        extraction.event_start_date != null ||
        extraction.event_end_date != null;
      if (dateSignal) {
        const es = coerceOptionalEventDateForUpdate(extraction.event_start_date);
        const ee = coerceOptionalEventDateForUpdate(extraction.event_end_date);
        const hasRange =
          es &&
          ee &&
          new Date(es).getTime() !== new Date(ee).getTime();
        if (hasRange) {
          patch.event_start_date = es;
          patch.event_end_date = ee;
        } else {
          patch.event_start_date = null;
          patch.event_end_date = null;
        }
      }

      if (extraction.location?.trim()) {
        patch.location = extraction.location.trim().slice(0, 500);
      }
      if (extraction.story_notes?.trim()) {
        patch.story_notes = extraction.story_notes.trim().slice(0, 8000);
      }
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabaseAdmin
        .from("weddings")
        .update(patch)
        .eq("id", weddingId)
        .eq("photographer_id", photographerId);
      if (error) throw new Error(`merge extraction into wedding: ${error.message}`);
    });

    const rawMessageStr =
      typeof raw_message === "string" ? raw_message : String(raw_message ?? "");

    const liveEmailPostBootstrap =
      isIntakeLiveOrchestratorPostBootstrapEmailEnabled() &&
      reply_channel === "email" &&
      photographerId?.trim();

    if (liveEmailPostBootstrap) {
      const intakeLiveCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-live-email", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId,
          weddingId,
          threadId,
          replyChannel: "email",
          rawMessage: rawMessageStr,
          ...intakeOrchestratorInboundSender(sender_email),
          requestedExecutionMode: "draft_only",
          intakeLiveCorrelationId,
          intakeLiveFanoutSource: "intake_post_bootstrap_live_email",
        },
      });

      return {
        status: "facts_extracted_live_orchestrator_post_bootstrap_email",
        weddingId,
        threadId,
        extraction,
        intakeLiveCorrelationId,
      };
    }

    const liveWebPostBootstrap =
      isIntakeLiveOrchestratorPostBootstrapWebEnabled() &&
      reply_channel === "web" &&
      photographerId?.trim();

    if (liveWebPostBootstrap) {
      const intakeLiveWebCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-live-web", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId,
          weddingId,
          threadId,
          replyChannel: "web",
          rawMessage: rawMessageStr,
          ...intakeOrchestratorInboundSender(sender_email),
          requestedExecutionMode: "draft_only",
          intakeLiveWebCorrelationId,
          intakeLiveWebFanoutSource: "intake_post_bootstrap_live_web",
        },
      });

      return {
        status: "facts_extracted_live_orchestrator_post_bootstrap_web",
        weddingId,
        threadId,
        extraction,
        intakeLiveWebCorrelationId,
      };
    }

    const parityReplyChannel = intakeReplyChannelForOrchestratorParity(reply_channel);
    if (
      isIntakeShadowOrchestratorPostBootstrapEnabled() &&
      parityReplyChannel !== null &&
      photographerId?.trim()
    ) {
      const intakeParityCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-parity", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId,
          weddingId,
          threadId,
          replyChannel: parityReplyChannel,
          rawMessage: rawMessageStr,
          ...intakeOrchestratorInboundSender(sender_email),
          requestedExecutionMode: "draft_only",
          intakeParityCorrelationId,
          intakeParityFanoutSource: "intake_post_bootstrap_parity",
        },
      });
    }

    await step.sendEvent("handoff-to-persona", {
      name: "ai/intent.persona",
      data: {
        wedding_id: weddingId,
        thread_id: threadId,
        photographer_id: photographerId,
        raw_facts: extraction.raw_facts,
        reply_channel: reply_channel ?? undefined,
      },
    });

    return {
      status: "facts_extracted_handoff_sent",
      weddingId,
      threadId,
      extraction,
    };
  },
);
