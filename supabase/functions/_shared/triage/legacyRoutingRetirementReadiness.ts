/**
 * Pure retirement-readiness summary for pre-ingress `triage` + `comms/*` paths (audit only; no routing).
 */

export const LEGACY_ROUTING_RETIREMENT_READINESS_EVENT = "legacy_routing_retirement_readiness_v1" as const;

/** Stable machine-greppable blocker ids — do not rename without updating audit dashboards. */
export const TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED = "triage_function_still_registered" as const;
export const TRIAGE_RETIREMENT_BLOCKING_WEB_EMITTER_IN_REPO = "web_pre_ingress_emitter_still_present" as const;
export const TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT =
  "email_pre_ingress_external_emitter_not_ruled_out" as const;

export type LegacyRoutingRetirementReadinessRecord = {
  event: typeof LEGACY_ROUTING_RETIREMENT_READINESS_EVENT;
  triageRegistered: boolean;
  consumesCommsEmailReceived: boolean;
  consumesCommsWebReceived: boolean;
  webEmitterPresentInRepo: boolean;
  emailEmitterPresentInRepo: boolean;
  retirementReady: boolean;
  blockingReasons: string[];
};

export type BuildLegacyRoutingRetirementReadinessInput = {
  triageRegistered: boolean;
  consumesCommsEmailReceived: boolean;
  consumesCommsWebReceived: boolean;
  webEmitterPresentInRepo: boolean;
  emailEmitterPresentInRepo: boolean;
};

/**
 * Conservative: not ready while triage remains registered, an in-repo web emitter exists, or email pre-ingress
 * is still subscribed without an observed in-repo producer (external ingress not ruled out).
 */
export function buildLegacyRoutingRetirementReadinessRecord(
  input: BuildLegacyRoutingRetirementReadinessInput,
): LegacyRoutingRetirementReadinessRecord {
  const blockingReasons: string[] = [];

  if (input.triageRegistered) {
    blockingReasons.push(TRIAGE_RETIREMENT_BLOCKING_TRIAGE_STILL_REGISTERED);
  }
  if (input.webEmitterPresentInRepo) {
    blockingReasons.push(TRIAGE_RETIREMENT_BLOCKING_WEB_EMITTER_IN_REPO);
  }
  if (input.consumesCommsEmailReceived && !input.emailEmitterPresentInRepo) {
    blockingReasons.push(TRIAGE_RETIREMENT_BLOCKING_EMAIL_EXTERNAL_NOT_RULED_OUT);
  }

  return {
    event: LEGACY_ROUTING_RETIREMENT_READINESS_EVENT,
    triageRegistered: input.triageRegistered,
    consumesCommsEmailReceived: input.consumesCommsEmailReceived,
    consumesCommsWebReceived: input.consumesCommsWebReceived,
    webEmitterPresentInRepo: input.webEmitterPresentInRepo,
    emailEmitterPresentInRepo: input.emailEmitterPresentInRepo,
    retirementReady: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function logLegacyRoutingRetirementReadinessRecord(record: LegacyRoutingRetirementReadinessRecord): void {
  console.info("[triage.legacy_retirement_readiness]", JSON.stringify(record));
}
