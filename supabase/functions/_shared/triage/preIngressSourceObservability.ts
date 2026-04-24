/**
 * Pre-ingress source observability for `triageFunction` (`comms/web.received` vs `comms/email.received`).
 * Pure builders only — classification uses event name only (no payload introspection).
 */

export const COMMS_WEB_RECEIVED_EVENT = "comms/web.received" as const;
export const COMMS_EMAIL_RECEIVED_EVENT = "comms/email.received" as const;

export type PreIngressSourceObservability =
  | "web_pre_ingress"
  | "email_pre_ingress"
  /** WhatsApp and any other triage subscriber not in the web/email pre-ingress split. */
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
