/**
 * Inbound suppression classifier — single source of truth for deciding whether an
 * incoming email thread is a real human client/lead vs. promotional / system /
 * transactional non-client mail.
 *
 * Consumed by:
 *   - `supabase/functions/_shared/gmail/executeSingleImportCandidateApprove.ts`
 *   - `supabase/functions/inngest/functions/processGmailLabelGroupApproval.ts`
 *   - `supabase/functions/_shared/gmail/gmailImportMaterialize.ts`
 *   - `supabase/functions/_shared/context/buildDecisionContext.ts`
 *   - `supabase/functions/_shared/orchestrator/proposeClientOrchestratorCandidateActions.ts`
 *   - `src/lib/inboxReplyRecipient.ts` (UI replyability)
 *
 * DB twin (sender + subject + body only, no optional headers):
 *   `public.classify_inbound_suppression` — keep aligned with migrations
 *   `20260507000000` + `20260509000000` for `convert_unfiled_thread_to_inquiry`.
 *
 * Contract:
 *   - Pure, deterministic, no I/O, no LLM.
 *   - Safe for Deno + browser (no imports from node / dom / deno).
 *   - Never throws on malformed input — returns `unknown_review_needed` in that case.
 *
 * Precedence (highest to lowest):
 *   1. Explicit system/auto headers (`Auto-Submitted`, `Precedence: bulk|list|junk`,
 *      `List-Unsubscribe`) → marketing / system / notification.
 *   2. Sender local-part / domain heuristics → promotional_or_marketing / system_or_notification.
 *   3. Body content heuristics (unsubscribe language, "do not reply", OTA copy) →
 *      promotional_or_marketing / transactional_non_client.
 *   4. Subject heuristics (weak, only nudges confidence).
 *   5. Default: `human_client_or_lead`.
 *
 * The module is intentionally conservative: it prefers false-negatives
 * (classifying promo as human_client) to avoid eating real leads, except when
 * strong deterministic signals converge.
 */

export type InboundSuppressionVerdict =
  | "human_client_or_lead"
  | "promotional_or_marketing"
  | "system_or_notification"
  | "transactional_non_client"
  | "unknown_review_needed";

export type InboundSuppressionReasonCode =
  | "sender_local_marketing_token"
  | "sender_local_system_token"
  | "sender_domain_ota_or_marketplace"
  | "sender_domain_marketing_subdomain"
  | "header_auto_submitted"
  | "header_precedence_bulk"
  | "header_list_unsubscribe"
  | "body_unsubscribe_language"
  | "body_do_not_reply_language"
  | "body_automated_disclaimer"
  | "body_ota_promo_copy"
  | "body_newsletter_markers"
  | "subject_promo_markers"
  | "subject_transactional_receipt"
  | "body_transactional_receipt"
  | "empty_or_unparseable";

export type InboundSuppressionInput = {
  /** Raw From header or display sender (`"Name <email>"` or bare email). */
  senderRaw: string | null | undefined;
  /** Message subject (optional). */
  subject?: string | null;
  /** Plain-text body (HTML should be stripped before passing). */
  body?: string | null;
  /**
   * Optional raw email headers (lower-case names recommended). Pass what is
   * available; missing headers are ignored. Supports:
   *   - `auto-submitted`
   *   - `precedence`
   *   - `list-unsubscribe`
   *   - `list-id`
   */
  headers?: Record<string, string | null | undefined> | null;
  /** Optional recipient count (a very large To/Cc list is a blast signal). */
  recipientCount?: number | null;
};

export type InboundSuppressionClassification = {
  verdict: InboundSuppressionVerdict;
  /** True when `verdict` is anything other than `human_client_or_lead`. */
  suppressed: boolean;
  /** Ordered, deduplicated list of signals that drove the verdict (bounded). */
  reasons: InboundSuppressionReasonCode[];
  /** Low / medium / high confidence. */
  confidence: "low" | "medium" | "high";
  /** Normalized sender email (lower-case, angle-unwrapped) when extractable. */
  normalizedSenderEmail: string | null;
  /** Normalized domain (lower-case) when extractable. */
  normalizedSenderDomain: string | null;
};

/** Local-part tokens that are **strong** promotional / marketing signals. */
const MARKETING_LOCAL_TOKENS: readonly string[] = [
  "campaign",
  "campaigns",
  "newsletter",
  "newsletters",
  "marketing",
  "promo",
  "promos",
  "promotion",
  "promotions",
  "offers",
  "deals",
  "deal",
  "sales",
  "announce",
  "announcements",
  "mailers",
  "mailer",
  "digest",
  "weekly",
  "monthly",
  "briefing",
  "update",
  "updates",
];

/** Local-part tokens that are **strong** system / transactional signals. */
const SYSTEM_LOCAL_TOKENS: readonly string[] = [
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "notifications",
  "notification",
  "notify",
  "alerts",
  "alert",
  "system",
  "automated",
  "auto",
  "bounces",
  "bounce",
  "mailer-daemon",
  "postmaster",
  "support-noreply",
];

/**
 * Sender domains that are OTA / marketplace / travel platforms whose mail to a
 * studio is **never** a wedding inquiry. Subdomains match by right-hand suffix.
 *
 * NOTE: this list is intentionally short and conservative — add new entries
 * with tests. Matching uses `endsWith` against the full normalized domain.
 */
const OTA_OR_MARKETPLACE_DOMAIN_SUFFIXES: readonly string[] = [
  "booking.com",
  "airbnb.com",
  "expedia.com",
  "tripadvisor.com",
  "trivago.com",
  "agoda.com",
  "hotels.com",
  "kayak.com",
  "skyscanner.com",
  "opentable.com",
];

/**
 * Marketing-subdomain prefixes that, when combined with any corporate domain,
 * suggest bulk mail infrastructure. E.g. `mail.<brand>.com`, `e.<brand>.com`,
 * `email.<brand>.com`, `news.<brand>.com`, `campaign.<brand>.com`.
 */
const MARKETING_SUBDOMAIN_PREFIXES: readonly string[] = [
  "mail",
  "email",
  "e",
  "news",
  "newsletter",
  "campaign",
  "campaigns",
  "marketing",
  "promo",
  "promos",
  "offers",
  "deals",
  "send",
  "notify",
  "notifications",
  "updates",
  "mailer",
  "mailers",
  "sg",
  "em",
  "t",
];

/** Unsubscribe/automation copy in bodies (lower-case substrings). */
const UNSUBSCRIBE_BODY_MARKERS: readonly string[] = [
  "unsubscribe",
  "opt out",
  "opt-out",
  "manage your preferences",
  "manage preferences",
  "email preferences",
  "update your preferences",
  "view this email in your browser",
  "view in browser",
];

const DO_NOT_REPLY_BODY_MARKERS: readonly string[] = [
  "do not reply to this email",
  "do not reply to this message",
  "please do not reply",
  "this is an automated",
  "these emails are sent automatically",
  "this mailbox is not monitored",
  "replies to this email are not",
];

const OTA_PROMO_COPY_MARKERS: readonly string[] = [
  "recommendations for your search",
  "best prices for your dates",
  "save on your next stay",
  "book now and save",
  "limited time offer",
  "flash sale",
  "your search results",
  "deals on your next trip",
  "genius members save",
];

const NEWSLETTER_BODY_MARKERS: readonly string[] = [
  "this week's highlights",
  "our weekly digest",
  "monthly newsletter",
  "in this issue",
  "top stories",
  "featured this week",
];

const SUBJECT_PROMO_TOKENS: readonly string[] = [
  "% off",
  "sale",
  "flash sale",
  "deals",
  "newsletter",
  "unsubscribe",
  "promo",
  "promotion",
  "limited time",
  "special offer",
  "exclusive offer",
  "you're invited",
  "you are invited",
  "webinar",
  "black friday",
  "cyber monday",
];

/**
 * Subject lines that strongly imply merchant receipt / billing / order
 * confirmation (not a conversational client email). Kept regex-based to avoid
 * suppressing subjects like "Invoice for deposit — Smith wedding" from a
 * personal inbox with no other transactional signals.
 */
const SUBJECT_STRONG_TRANSACTIONAL_PATTERNS: readonly RegExp[] = [
  /^\s*receipt\b/i,
  /^\s*your\s+receipt\b/i,
  /^\s*payment\s+receipt\b/i,
  /^\s*payment\s+received\b/i,
  /^\s*payment\s+confirmation\b/i,
  /^\s*order\s+confirmation\b/i,
  /^\s*order\s+confirmed\b/i,
  /^\s*your\s+order\s+(has\s+been\s+)?confirm/i,
  /^\s*billing\s+statement\b/i,
  /^\s*tax\s+invoice\b/i,
  /^\s*invoice\s+payment\s+received\b/i,
  /automatic\s+payment\b/i,
  /subscription\s+renewal\b/i,
];

/** Body snippets typical of receipts, invoices, and order confirmations. */
const BODY_TRANSACTIONAL_RECEIPT_MARKERS: readonly string[] = [
  "thank you for your order",
  "thank you for your purchase",
  "items in your order",
  "this email confirms your purchase",
  "your payment has been processed",
  "amount charged to your",
  "card ending in",
  "transaction id:",
  "transaction reference:",
  "view your order",
  "order summary",
  "sales tax",
  "subtotal:",
  "total due:",
  "amount paid:",
  "invoice number:",
  "invoice #",
  "paid in full",
  "payment successful",
];

function toLower(s: string | null | undefined): string {
  return typeof s === "string" ? s.toLowerCase() : "";
}

/** Extract first `addr@domain` out of `"Name <a@b>"` / bare email / junk. */
export function extractSenderEmailFromRaw(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  const angle = /<([^>]+@[^>]+)>/i.exec(t);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const word = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}/.exec(t);
  if (word?.[0]) return word[0].trim().toLowerCase();
  return null;
}

function splitLocalAndDomain(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/**
 * Tokenize a local-part into lower-case alphanumeric-ish tokens separated by
 * `.`, `-`, `_`, `+`. `email.campaign` → `["email", "campaign"]`.
 */
function tokenizeLocalPart(local: string): string[] {
  return local
    .toLowerCase()
    .split(/[.+_\-]/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function hasMarketingLocalToken(local: string): boolean {
  const tokens = tokenizeLocalPart(local);
  for (const t of tokens) {
    if (MARKETING_LOCAL_TOKENS.includes(t)) return true;
  }
  return false;
}

function hasSystemLocalToken(local: string): boolean {
  const tokens = tokenizeLocalPart(local);
  for (const t of tokens) {
    if (SYSTEM_LOCAL_TOKENS.includes(t)) return true;
  }
  const flat = local.toLowerCase();
  // Catch run-together patterns: `nonreply`, `noreply01`, `donotreply-marketing`.
  if (/no[-._+]?reply/.test(flat)) return true;
  if (/do[-._+]?not[-._+]?reply/.test(flat)) return true;
  return false;
}

/** `endsWith`-style match against known OTA domains (subdomain-safe). */
export function domainIsOtaOrMarketplace(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  for (const suffix of OTA_OR_MARKETPLACE_DOMAIN_SUFFIXES) {
    if (d === suffix || d.endsWith("." + suffix)) return true;
  }
  return false;
}

/** True when a domain's leftmost label is a recognized marketing subdomain prefix. */
export function domainLooksLikeMarketingSubdomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  const labels = d.split(".").filter((l) => l.length > 0);
  if (labels.length < 3) return false;
  const first = labels[0] ?? "";
  if (!MARKETING_SUBDOMAIN_PREFIXES.includes(first)) return false;
  return true;
}

function normalizeHeaderMap(
  headers: Record<string, string | null | undefined> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v !== "string" || v.length === 0) continue;
    out[k.toLowerCase()] = v.trim();
  }
  return out;
}

/**
 * Classify an inbound email. Pure, deterministic; safe to call from DB workers
 * and UI code alike.
 */
export function classifyInboundSuppression(
  input: InboundSuppressionInput,
): InboundSuppressionClassification {
  const senderRaw = typeof input.senderRaw === "string" ? input.senderRaw : "";
  const subject = typeof input.subject === "string" ? input.subject : "";
  const body = typeof input.body === "string" ? input.body : "";
  const headers = normalizeHeaderMap(input.headers);

  const reasons: InboundSuppressionReasonCode[] = [];
  const pushReason = (r: InboundSuppressionReasonCode) => {
    if (!reasons.includes(r)) reasons.push(r);
  };

  const email = extractSenderEmailFromRaw(senderRaw);
  const parts = email ? splitLocalAndDomain(email) : null;
  const normalizedSenderEmail = email;
  const normalizedSenderDomain = parts?.domain ?? null;

  if (!senderRaw.trim() && !subject && !body) {
    return {
      verdict: "unknown_review_needed",
      suppressed: true,
      reasons: ["empty_or_unparseable"],
      confidence: "low",
      normalizedSenderEmail,
      normalizedSenderDomain,
    };
  }

  let marketingScore = 0;
  let systemScore = 0;
  let transactionalScore = 0;

  // --- 1. Headers -----------------------------------------------------------
  const autoSubmitted = headers["auto-submitted"];
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") {
    pushReason("header_auto_submitted");
    systemScore += 2;
  }
  const precedence = headers["precedence"];
  if (precedence) {
    const p = precedence.toLowerCase();
    if (p === "bulk" || p === "list" || p === "junk") {
      pushReason("header_precedence_bulk");
      marketingScore += 2;
    }
  }
  if (headers["list-unsubscribe"] || headers["list-id"]) {
    pushReason("header_list_unsubscribe");
    marketingScore += 2;
  }

  // --- 2. Sender local-part / domain ---------------------------------------
  if (parts) {
    if (hasMarketingLocalToken(parts.local)) {
      pushReason("sender_local_marketing_token");
      marketingScore += 2;
    }
    if (hasSystemLocalToken(parts.local)) {
      pushReason("sender_local_system_token");
      systemScore += 2;
    }
    if (domainIsOtaOrMarketplace(parts.domain)) {
      pushReason("sender_domain_ota_or_marketplace");
      marketingScore += 3;
    }
    if (domainLooksLikeMarketingSubdomain(parts.domain)) {
      pushReason("sender_domain_marketing_subdomain");
      marketingScore += 1;
    }
  }

  // --- 3. Body content ------------------------------------------------------
  const bodyLower = toLower(body);
  if (bodyLower.length > 0) {
    for (const m of UNSUBSCRIBE_BODY_MARKERS) {
      if (bodyLower.includes(m)) {
        pushReason("body_unsubscribe_language");
        marketingScore += 2;
        break;
      }
    }
    for (const m of DO_NOT_REPLY_BODY_MARKERS) {
      if (bodyLower.includes(m)) {
        pushReason("body_do_not_reply_language");
        systemScore += 2;
        break;
      }
    }
    for (const m of OTA_PROMO_COPY_MARKERS) {
      if (bodyLower.includes(m)) {
        pushReason("body_ota_promo_copy");
        marketingScore += 2;
        break;
      }
    }
    for (const m of NEWSLETTER_BODY_MARKERS) {
      if (bodyLower.includes(m)) {
        pushReason("body_newsletter_markers");
        marketingScore += 1;
        break;
      }
    }
    if (
      /this\s+is\s+an?\s+automated\s+(message|notification|email)/.test(bodyLower) ||
      /automatically\s+generated\s+(email|message)/.test(bodyLower)
    ) {
      pushReason("body_automated_disclaimer");
      systemScore += 2;
    }
  }

  // --- 4. Subject (weak promo + strong transactional) -----------------------
  const subjectLower = toLower(subject);
  if (subjectLower.length > 0) {
    let subjectHit = false;
    for (const m of SUBJECT_PROMO_TOKENS) {
      if (subjectLower.includes(m)) {
        subjectHit = true;
        break;
      }
    }
    if (/\d+\s*%\s*off/.test(subjectLower)) subjectHit = true;
    if (subjectHit) {
      pushReason("subject_promo_markers");
      marketingScore += 1;
    }

    let transactionalSubject = false;
    for (const re of SUBJECT_STRONG_TRANSACTIONAL_PATTERNS) {
      if (re.test(subject)) {
        transactionalSubject = true;
        break;
      }
    }
    if (transactionalSubject) {
      pushReason("subject_transactional_receipt");
      transactionalScore += 3;
    } else if (
      /\binvoice\b/i.test(subjectLower) &&
      (systemScore > 0 || (parts && hasSystemLocalToken(parts.local)))
    ) {
      // Billing-platform invoice from noreply/billing/etc. — not a client's one-off subject.
      pushReason("subject_transactional_receipt");
      transactionalScore += 2;
    }
  }

  // --- 4b. Body: receipt / billing copy -----------------------------------
  if (bodyLower.length > 0) {
    for (const m of BODY_TRANSACTIONAL_RECEIPT_MARKERS) {
      if (bodyLower.includes(m)) {
        pushReason("body_transactional_receipt");
        transactionalScore += 2;
        break;
      }
    }
  }

  // --- 5. Decide verdict ----------------------------------------------------
  // Thresholds are intentionally modest — they must fire only when independent
  // signals align (local-part + domain, or header + body, etc).
  const MARKETING_THRESHOLD = 3;
  const SYSTEM_THRESHOLD = 3;

  let verdict: InboundSuppressionVerdict = "human_client_or_lead";
  let confidence: "low" | "medium" | "high" = "low";

  if (marketingScore >= MARKETING_THRESHOLD && marketingScore >= systemScore) {
    verdict = "promotional_or_marketing";
    confidence = marketingScore >= 5 ? "high" : "medium";
  } else if (systemScore >= SYSTEM_THRESHOLD) {
    verdict = "system_or_notification";
    confidence = systemScore >= 5 ? "high" : "medium";
  } else if (transactionalScore >= 2) {
    verdict = "transactional_non_client";
    confidence = transactionalScore >= 4 ? "high" : "medium";
  } else if (marketingScore > 0 || systemScore > 0) {
    // Single weak signal only — don't suppress, but flag low confidence.
    verdict = "human_client_or_lead";
    confidence = "low";
  } else {
    verdict = "human_client_or_lead";
    confidence = reasons.length === 0 ? "medium" : "low";
  }

  return {
    verdict,
    suppressed: verdict !== "human_client_or_lead",
    reasons,
    confidence,
    normalizedSenderEmail,
    normalizedSenderDomain,
  };
}

/**
 * Convenience predicate: true when the classifier says the sender should not
 * receive an Ana client draft and should not be promoted to inquiry.
 */
export function isSuppressedInboundVerdict(
  verdict: InboundSuppressionVerdict,
): boolean {
  return verdict !== "human_client_or_lead";
}

/**
 * Stable, compact machine-readable summary string suitable for `ai_routing_metadata`
 * or error responses from the convert-to-inquiry RPC.
 */
export function formatInboundSuppressionTag(
  classification: InboundSuppressionClassification,
): string {
  return `${classification.verdict}:${classification.confidence}:${classification.reasons.join(",")}`;
}
