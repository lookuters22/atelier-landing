import { describe, expect, it, vi } from "vitest";
import {
  buildPreIngressSourceObservabilityRecord,
  COMMS_EMAIL_RECEIVED_EVENT,
  COMMS_WEB_RECEIVED_EVENT,
  logPreIngressSourceObservabilityRecord,
} from "./preIngressSourceObservability.ts";

function assertNoBodyLeak(record: ReturnType<typeof buildPreIngressSourceObservabilityRecord>): void {
  const json = JSON.stringify(record);
  expect(json).not.toMatch(/raw[_-]?message/i);
  expect(json).not.toContain("SECRET_BODY");
  const forbiddenKeys = ["raw_message", "rawMessage", "body", "text", "message"];
  for (const k of forbiddenKeys) {
    expect(Object.keys(record)).not.toContain(k);
  }
}

describe("buildPreIngressSourceObservabilityRecord", () => {
  it("comms/web.received → web_pre_ingress", () => {
    const r = buildPreIngressSourceObservabilityRecord({
      ingressEventName: COMMS_WEB_RECEIVED_EVENT,
      replyChannel: "web",
      photographerIdPresent: true,
    });
    expect(r).toMatchObject({
      event: "pre_ingress_source_v1",
      ingressEventName: COMMS_WEB_RECEIVED_EVENT,
      ingressSource: "web_pre_ingress",
      replyChannel: "web",
      photographerIdPresent: true,
    });
    assertNoBodyLeak(r);
  });

  it("comms/email.received → email_pre_ingress", () => {
    const r = buildPreIngressSourceObservabilityRecord({
      ingressEventName: COMMS_EMAIL_RECEIVED_EVENT,
      replyChannel: "email",
      photographerIdPresent: false,
    });
    expect(r).toMatchObject({
      ingressEventName: COMMS_EMAIL_RECEIVED_EVENT,
      ingressSource: "email_pre_ingress",
      replyChannel: "email",
      photographerIdPresent: false,
    });
    assertNoBodyLeak(r);
  });

  it("reply channel is passed through unchanged (web / email)", () => {
    const web = buildPreIngressSourceObservabilityRecord({
      ingressEventName: COMMS_WEB_RECEIVED_EVENT,
      replyChannel: "web",
      photographerIdPresent: true,
    });
    const email = buildPreIngressSourceObservabilityRecord({
      ingressEventName: COMMS_EMAIL_RECEIVED_EVENT,
      replyChannel: "email",
      photographerIdPresent: true,
    });
    expect(web.replyChannel).toBe("web");
    expect(email.replyChannel).toBe("email");
  });
});

describe("logPreIngressSourceObservabilityRecord", () => {
  it("emits grep-friendly prefix and JSON body", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const record = buildPreIngressSourceObservabilityRecord({
      ingressEventName: COMMS_EMAIL_RECEIVED_EVENT,
      replyChannel: "email",
      photographerIdPresent: true,
    });
    logPreIngressSourceObservabilityRecord(record);
    expect(info).toHaveBeenCalledTimes(1);
    const [label, payload] = info.mock.calls[0] as [string, string];
    expect(label).toBe("[triage.pre_ingress_source]");
    expect(JSON.parse(payload)).toEqual(record);
    info.mockRestore();
  });
});
