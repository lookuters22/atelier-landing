/**
 * Legacy operator WhatsApp ingress: `comms/whatsapp.received` and `operator/whatsapp.legacy.received`
 * → `ai/intent.internal_concierge` only (same behavior as the early branch formerly in `traffic-cop-triage`).
 * Does not handle email/web pre-ingress (`comms/email.received` / `comms/web.received` — retired).
 */
import {
  inngest,
  OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT,
} from "../../_shared/inngest.ts";
import {
  buildPreIngressSourceObservabilityRecord,
  logPreIngressSourceObservabilityRecord,
} from "../../_shared/triage/preIngressSourceObservability.ts";

export const legacyWhatsappIngressFunction = inngest.createFunction(
  { id: "legacy-whatsapp-ingress", name: "Legacy WhatsApp → Internal Concierge" },
  [{ event: "comms/whatsapp.received" }, { event: OPERATOR_WHATSAPP_LEGACY_RECEIVED_EVENT }],
  async ({ event, step }) => {
    const raw = (event.data as Record<string, unknown>) ?? {};
    const payload = (raw.raw_message as Record<string, unknown>) ?? {};
    const fromNumber = typeof payload.from === "string" ? payload.from : "";
    const messageBody =
      typeof payload.body === "string" ? payload.body : JSON.stringify(payload);
    const photographerId = typeof raw.photographer_id === "string" ? raw.photographer_id : "";

    console.log(
      `[legacy-whatsapp-ingress] WhatsApp received — bypassing email pipeline. From: ${fromNumber}, photographer: ${photographerId}`,
    );

    logPreIngressSourceObservabilityRecord(
      buildPreIngressSourceObservabilityRecord({
        ingressEventName: event.name,
        replyChannel: "whatsapp",
        photographerIdPresent: Boolean(photographerId.trim()),
      }),
    );

    await step.run("dispatch-internal-concierge", async () => {
      await inngest.send({
        name: "ai/intent.internal_concierge",
        data: {
          photographer_id: photographerId,
          from_number: fromNumber,
          raw_message: messageBody,
        },
      });
    });

    return {
      status: "routed_whatsapp_internal",
      photographer_id: photographerId,
      from_number: fromNumber,
    };
  },
);
