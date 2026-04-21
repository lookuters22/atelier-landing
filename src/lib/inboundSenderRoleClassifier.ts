/**
 * Layer 3 — inbound **sender role** (who is writing and why), orthogonal to `TriageIntent`.
 * Used only on the unlinked post-ingest non-wedding business path when enabled via env.
 *
 * On any failure, returns `unclear` / `low` — never throws.
 */
export const INBOUND_SENDER_ROLES = [
  "customer_lead",
  "vendor_solicitation",
  "partnership_or_collaboration",
  "billing_or_account_followup",
  "recruiter_or_job_outreach",
  "unclear",
] as const;

export type InboundSenderRole = (typeof INBOUND_SENDER_ROLES)[number];

export type InboundSenderRoleConfidence = "low" | "medium" | "high";

export type InboundSenderRoleClassification = {
  role: InboundSenderRole;
  confidence: InboundSenderRoleConfidence;
  /** Short model rationale when present */
  reason?: string;
};

const ROLE_SET = new Set<string>(INBOUND_SENDER_ROLES);
const CONFIDENCE_SET = new Set<string>(["low", "medium", "high"]);

const MAX_SENDER = 500;
const MAX_SUBJECT = 500;
const MAX_BODY = 8000;

function clip(s: string, max: number): string {
  const t = String(s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

const SYSTEM_PROMPT = `You classify the **human sender's role and purpose** in one inbound email to a wedding photography studio.
This is NOT triage routing intent (ignore intake/commercial/logistics buckets). Answer: what kind of human is writing, and why?

Return a single JSON object with keys exactly:
- "role": one of: customer_lead | vendor_solicitation | partnership_or_collaboration | billing_or_account_followup | recruiter_or_job_outreach | unclear
- "confidence": one of: low | medium | high
- "reason": optional short string (max ~200 chars), English or the email's language

Definitions:
- customer_lead: A person or business seeking photography (or related) **services** from the studio — quotes, shoots, sessions, weddings, events as a **client**.
- vendor_solicitation: Selling services TO the studio (SEO, web dev, ads, listings, agencies pitching retainers, cold sales). Includes pitches in **any language** (e.g. Serbian, Italian) offering websites, search optimization, paid ads, or software to the studio. Agency outreach proposing "collaboration" that is clearly **selling** their services is vendor_solicitation, not partnership.
- partnership_or_collaboration: Genuine creative cooperation without a sales pitch for their product (e.g. styled shoot, referral circle, mutual portfolio feature) — not a cold vendor package offer.
- billing_or_account_followup: Invoices, payments, subscriptions, account admin, receipts, balance reminders (human, not newsletter).
- recruiter_or_job_outreach: Hiring, job offers, LinkedIn-style recruiting, staffing.
- unclear: Cannot tell confidently.

Confidence:
- For **obvious** cold sales / agency packages / SEO-website-ads pitches, use **medium** or **high** — not **low**.
- Use **low** or **unclear** only when the message is truly ambiguous or too short to tell.`;

export type ClassifyInboundSenderRoleOptions = {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
};

/** Strip markdown fences and extract a JSON object for robust parsing of chat completions. */
export function normalizeOpenAiJsonObjectText(raw: string): string {
  let s = String(raw ?? "").trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im;
  const m = s.match(fence);
  if (m) s = m[1].trim();
  return s;
}

function tryParseJsonObject(text: string): unknown {
  const normalized = normalizeOpenAiJsonObjectText(text);
  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function parseClassificationJson(raw: string): InboundSenderRoleClassification | null {
  const parsed = tryParseJsonObject(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const roleRaw = typeof o.role === "string" ? o.role.trim() : "";
  const confRaw = typeof o.confidence === "string" ? o.confidence.trim().toLowerCase() : "";
  const reasonRaw = typeof o.reason === "string" ? o.reason.trim().slice(0, 200) : undefined;

  if (!ROLE_SET.has(roleRaw) || !CONFIDENCE_SET.has(confRaw)) return null;

  return {
    role: roleRaw as InboundSenderRole,
    confidence: confRaw as InboundSenderRoleConfidence,
    ...(reasonRaw ? { reason: reasonRaw } : {}),
  };
}

/**
 * @param input — only sender, subject, body (no headers).
 */
export async function classifyInboundSenderRole(
  input: {
    senderRaw: string;
    subject: string | null | undefined;
    body: string;
  },
  options?: ClassifyInboundSenderRoleOptions,
): Promise<InboundSenderRoleClassification> {
  const unclear: InboundSenderRoleClassification = { role: "unclear", confidence: "low" };

  const apiKey = options?.apiKey?.trim();
  if (!apiKey) return unclear;

  const fetchFn = options?.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return unclear;

  const userPayload = [
    `From: ${clip(input.senderRaw, MAX_SENDER)}`,
    `Subject: ${clip(String(input.subject ?? ""), MAX_SUBJECT)}`,
    "",
    clip(String(input.body ?? ""), MAX_BODY),
  ].join("\n");

  try {
    const res = await fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: options?.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPayload },
        ],
      }),
    });

    if (!res.ok) return unclear;

    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) return unclear;

    const parsed = parseClassificationJson(content);
    if (!parsed) return unclear;

    return parsed;
  } catch {
    return unclear;
  }
}

export function isTriageInboundSenderRoleClassifierV1EnabledFromEnv(
  env: { get(key: string): string | undefined },
): boolean {
  const v = env.get("TRIAGE_INBOUND_SENDER_ROLE_CLASSIFIER_V1")?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
