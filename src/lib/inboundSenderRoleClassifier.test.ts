import { describe, expect, it, vi } from "vitest";
import {
  classifyInboundSenderRole,
  isTriageInboundSenderRoleClassifierV1EnabledFromEnv,
  normalizeOpenAiJsonObjectText,
} from "./inboundSenderRoleClassifier.ts";

function mockFetchJsonResponse(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  });
}

const baseInput = {
  senderRaw: "someone@example.com",
  subject: "Hello",
  body: "Body",
};

describe("classifyInboundSenderRole", () => {
  it("Serbian agency pitch → vendor_solicitation", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({
        role: "vendor_solicitation",
        confidence: "high",
        reason: "Agency offers marketing",
      }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "Poštovani, naša agencija nudi SEO i Google oglase za fotografe.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("vendor_solicitation");
    expect(out.confidence).toBe("high");
  });

  it("English SEO/web-dev pitch → vendor_solicitation", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "vendor_solicitation", confidence: "medium" }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "We build fast Next.js sites for photographers — 30-day launch guarantee.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("vendor_solicitation");
    expect(out.confidence).toBe("medium");
  });

  it("Italian partnership outreach → partnership_or_collaboration", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({
        role: "partnership_or_collaboration",
        confidence: "high",
        reason: "Styled shoot proposal",
      }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "Ciao, proponiamo una collaborazione per uno shooting editoriale condiviso.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("partnership_or_collaboration");
  });

  it("Spanish customer non-wedding lead → customer_lead", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "customer_lead", confidence: "high" }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "Hola, buscamos fotógrafo para sesión de retratos familiares en Madrid.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("customer_lead");
  });

  it("French commercial shoot lead → customer_lead", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "customer_lead", confidence: "medium" }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "Bonjour, nous cherchons un photographe pour une campagne e-commerce.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("customer_lead");
  });

  it("billing follow-up → billing_or_account_followup", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "billing_or_account_followup", confidence: "high" }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "Invoice #4421 is overdue — please remit payment by Friday.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("billing_or_account_followup");
  });

  it("recruiter outreach → recruiter_or_job_outreach", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "recruiter_or_job_outreach", confidence: "medium" }),
    );
    const out = await classifyInboundSenderRole(
      {
        ...baseInput,
        body: "We're hiring a full-time photo editor — would love to chat about the role.",
      },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("recruiter_or_job_outreach");
  });

  it("ambiguous case → unclear", async () => {
    const fetchImpl = mockFetchJsonResponse(
      JSON.stringify({ role: "unclear", confidence: "low" }),
    );
    const out = await classifyInboundSenderRole(
      { ...baseInput, body: "FYI." },
      { apiKey: "sk-test", fetchImpl },
    );
    expect(out.role).toBe("unclear");
  });

  it("bad model output → unclear", async () => {
    const fetchImpl = mockFetchJsonResponse("not-json");
    const out = await classifyInboundSenderRole(baseInput, { apiKey: "sk-test", fetchImpl });
    expect(out.role).toBe("unclear");
    expect(out.confidence).toBe("low");
  });

  it("HTTP error → unclear", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const out = await classifyInboundSenderRole(baseInput, { apiKey: "sk-test", fetchImpl });
    expect(out.role).toBe("unclear");
  });

  it("missing API key → unclear without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const out = await classifyInboundSenderRole(baseInput, { apiKey: "", fetchImpl });
    expect(out.role).toBe("unclear");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetch throws → unclear", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    const out = await classifyInboundSenderRole(baseInput, { apiKey: "sk-test", fetchImpl });
    expect(out.role).toBe("unclear");
  });

  it("parses model output wrapped in markdown json fence", async () => {
    const inner = JSON.stringify({ role: "vendor_solicitation", confidence: "high" });
    const fetchImpl = mockFetchJsonResponse(`\`\`\`json\n${inner}\n\`\`\``);
    const out = await classifyInboundSenderRole(baseInput, { apiKey: "sk-test", fetchImpl });
    expect(out.role).toBe("vendor_solicitation");
    expect(out.confidence).toBe("high");
  });
});

describe("normalizeOpenAiJsonObjectText", () => {
  it("strips ```json fences", () => {
    expect(normalizeOpenAiJsonObjectText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("isTriageInboundSenderRoleClassifierV1EnabledFromEnv", () => {
  it("accepts 1 / true / yes", () => {
    expect(isTriageInboundSenderRoleClassifierV1EnabledFromEnv({ get: () => "1" })).toBe(true);
    expect(isTriageInboundSenderRoleClassifierV1EnabledFromEnv({ get: () => "true" })).toBe(true);
    expect(isTriageInboundSenderRoleClassifierV1EnabledFromEnv({ get: () => "YES" })).toBe(true);
  });
  it("off when unset or 0", () => {
    expect(isTriageInboundSenderRoleClassifierV1EnabledFromEnv({ get: () => undefined })).toBe(
      false,
    );
    expect(isTriageInboundSenderRoleClassifierV1EnabledFromEnv({ get: () => "0" })).toBe(false);
  });
});
