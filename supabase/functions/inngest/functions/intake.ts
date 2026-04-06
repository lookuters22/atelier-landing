/**
 * Intake Agent — Data Extractor & Researcher for new leads.
 *
 * Listens for ai/intent.intake.
 *
 * 1. Agentic loop extracts structured data from the inquiry and checks
 *    calendar availability via the calendar tool (shared: `runIntakeExtractionAndResearch`).
 * 2. Creates wedding, client, thread, and message rows via the intake bootstrap boundary.
 * 3. Hands off to the Persona Agent for brand-voice drafting, **or** (live email gate) to
 *    `ai/orchestrator.client.v1` only for that turn — **client intake migration targets email only.**
 *
 * Optional (`INTAKE_SHADOW_ORCHESTRATOR_POST_BOOTSTRAP_V1`): after bootstrap, emit `ai/orchestrator.client.v1`
 * for parity (`draft_only` semantics in proposals/verifier); orchestrator **skips draft + escalation DB writes**
 * for this fanout — persona handoff remains authoritative.
 *
 * Optional (`INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_EMAIL_V1` + `reply_channel === "email"`): after bootstrap,
 * **live** orchestrator (`draft_only`) — **no** persona that turn; **no** parity fanout.
 *
 * **Legacy / non–client-intake:** `INTAKE_LIVE_ORCHESTRATOR_POST_BOOTSTRAP_WEB_V1` + `reply_channel === "web"` may still
 *   fan out orchestrator for event-shape reasons; **dashboard web is photographer ↔ Ana, not client intake** — do not
 *   treat as a migration slice (see `docs/v3/INTAKE_MIGRATION_POST_CUT8_SLICE.md` §0).
 * WhatsApp unchanged (legacy persona + optional parity).
 */
import {
  inngest,
  ORCHESTRATOR_CLIENT_V1_EVENT,
  ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import {
  applyIntakeLeadCreation,
  applyIntakeOriginThreadLink,
  runIntakeExtractionAndResearch,
} from "../../_shared/intake/intakeBootstrapBoundary.ts";
import { isIntakeLiveOrchestratorPostBootstrapEmailEnabled } from "../../_shared/intake/intakeLivePostBootstrapOrchestratorGate.ts";
import { isIntakeLiveOrchestratorPostBootstrapWebEnabled } from "../../_shared/intake/intakeLivePostBootstrapOrchestratorWebGate.ts";
import { isIntakeShadowOrchestratorPostBootstrapEnabled } from "../../_shared/intake/intakePostBootstrapOrchestratorGate.ts";

/** Email/web only — `clientOrchestratorV1` does not run WhatsApp; parity skipped for WhatsApp intake. */
function intakeReplyChannelForOrchestratorParity(
  reply_channel: string | undefined,
): "email" | "web" | null {
  if (reply_channel === "web") return "web";
  if (reply_channel === "whatsapp") return null;
  return "email";
}

export const intakeFunction = inngest.createFunction(
  { id: "intake-worker", name: "Intake Agent — Data Extractor & Researcher" },
  { event: "ai/intent.intake" },
  async ({ event, step }) => {
    const {
      photographer_id,
      thread_id: originThreadId,
      raw_message,
      sender_email,
      reply_channel,
    } = event.data;

    const extraction = await step.run("extract-and-research", async () =>
      runIntakeExtractionAndResearch(raw_message),
    );

    const records = await step.run("create-wedding-records", async () =>
      applyIntakeLeadCreation(supabaseAdmin, {
        photographer_id,
        extraction,
        sender_email,
        raw_message,
      }),
    );

    if (originThreadId) {
      await step.run("link-originating-thread", async () => {
        await applyIntakeOriginThreadLink(supabaseAdmin, {
          photographer_id,
          origin_thread_id: originThreadId,
          new_wedding_id: records.weddingId,
        });
      });
    }

    const rawMessageStr =
      typeof raw_message === "string" ? raw_message : String(raw_message ?? "");

    const liveEmailPostBootstrap =
      isIntakeLiveOrchestratorPostBootstrapEmailEnabled() &&
      reply_channel === "email" &&
      photographer_id?.trim();

    if (liveEmailPostBootstrap) {
      const intakeLiveCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-live-email", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId: photographer_id,
          weddingId: records.weddingId,
          threadId: records.threadId,
          replyChannel: "email",
          rawMessage: rawMessageStr,
          requestedExecutionMode: "draft_only",
          intakeLiveCorrelationId,
          intakeLiveFanoutSource: "intake_post_bootstrap_live_email",
        },
      });

      return {
        status: "facts_extracted_live_orchestrator_post_bootstrap_email",
        weddingId: records.weddingId,
        threadId: records.threadId,
        extraction,
        intakeLiveCorrelationId,
      };
    }

    /** Not a client-intake target — web widget is photographer↔Ana; retained for payload/orchestrator parity only. */
    const liveWebPostBootstrap =
      isIntakeLiveOrchestratorPostBootstrapWebEnabled() &&
      reply_channel === "web" &&
      photographer_id?.trim();

    if (liveWebPostBootstrap) {
      const intakeLiveWebCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-live-web", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId: photographer_id,
          weddingId: records.weddingId,
          threadId: records.threadId,
          replyChannel: "web",
          rawMessage: rawMessageStr,
          requestedExecutionMode: "draft_only",
          intakeLiveWebCorrelationId,
          intakeLiveWebFanoutSource: "intake_post_bootstrap_live_web",
        },
      });

      return {
        status: "facts_extracted_live_orchestrator_post_bootstrap_web",
        weddingId: records.weddingId,
        threadId: records.threadId,
        extraction,
        intakeLiveWebCorrelationId,
      };
    }

    const parityReplyChannel = intakeReplyChannelForOrchestratorParity(reply_channel);
    if (
      isIntakeShadowOrchestratorPostBootstrapEnabled() &&
      parityReplyChannel !== null &&
      photographer_id?.trim()
    ) {
      const intakeParityCorrelationId = crypto.randomUUID();
      await step.sendEvent("intake-post-bootstrap-orchestrator-parity", {
        name: ORCHESTRATOR_CLIENT_V1_EVENT,
        data: {
          schemaVersion: ORCHESTRATOR_CLIENT_V1_SCHEMA_VERSION,
          photographerId: photographer_id,
          weddingId: records.weddingId,
          threadId: records.threadId,
          replyChannel: parityReplyChannel,
          rawMessage: rawMessageStr,
          requestedExecutionMode: "draft_only",
          intakeParityCorrelationId,
          intakeParityFanoutSource: "intake_post_bootstrap_parity",
        },
      });
    }

    await step.sendEvent("handoff-to-persona", {
      name: "ai/intent.persona",
      data: {
        wedding_id: records.weddingId,
        thread_id: records.threadId,
        photographer_id,
        raw_facts: extraction.raw_facts,
        reply_channel: reply_channel ?? undefined,
      },
    });

    return {
      status: "facts_extracted_handoff_sent",
      weddingId: records.weddingId,
      threadId: records.threadId,
      extraction,
    };
  },
);
