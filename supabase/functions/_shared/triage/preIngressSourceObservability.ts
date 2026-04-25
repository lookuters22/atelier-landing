/**
 * Narrow ingress observability for **legacy Inngest triggers** that are not Gmail/thread post-ingest.
 *
 * **Live:** `legacyWhatsappIngress` logs via this module (WhatsApp events → `other_pre_ingress`).
 * **Historical:** `comms/web.received` / `comms/email.received` are retired from the typed contract and
 * subscribers, but event-name classification is kept so any stale replay/log line still maps consistently.
 * Pure builders — classification uses `ingressEventName` only (no payload introspection).
 */

export const COMMS_WEB_RECEIVED_EVENT = "comms/web.received" as const;
export const COMMS_EMAIL_RECEIVED_EVENT = "comms/email.received" as const;

export type PreIngressSourceObservability =
  | "web_pre_ingress"
  | "email_pre_ingress"
  /** Retired email/web aside, includes live operator WhatsApp legacy events and any other non-web/email label. */
  | "other_pre_ingress";

export type PreIngressSourceObservabilityRecord = {
  event: "pre_ingress_source_v1";
  ingressEventName: string;
  ingressSource: PreIngressSourceObservability;
  replyChannel: "email" | "web" | "whatsapp";
  photographerIdPresent: boolean;
};

export type BuildPreIngressSourceObservabilityInput = {
  ingressEventName: string;
  replyChannel: "email" | "web" | "whatsapp";
  photographerIdPresent: boolean;
};

export function buildPreIngressSourceObservabilityRecord(
  input: BuildPreIngressSourceObservabilityInput,
): PreIngressSourceObservabilityRecord {
  let ingressSource: PreIngressSourceObservability;
  if (input.ingressEventName === COMMS_WEB_RECEIVED_EVENT) {
    ingressSource = "web_pre_ingress";
  } else if (input.ingressEventName === COMMS_EMAIL_RECEIVED_EVENT) {
    ingressSource = "email_pre_ingress";
  } else {
    ingressSource = "other_pre_ingress";
  }

  return {
    event: "pre_ingress_source_v1",
    ingressEventName: input.ingressEventName,
    ingressSource,
    replyChannel: input.replyChannel,
    photographerIdPresent: input.photographerIdPresent,
  };
}

export function logPreIngressSourceObservabilityRecord(record: PreIngressSourceObservabilityRecord): void {
  console.info("[triage.pre_ingress_source]", JSON.stringify(record));
}
