/**
 * Deterministic couple-name extraction for "Convert to New Inquiry" — avoids persisting
 * placeholder tails (e.g. "… and fiancé") when a structured subject line is available.
 */

const MAX_COUPLE_LEN = 500;
const WEAK_TAIL =
  /\b(and\s+)?(fiancée?|fiance|partner|spouse|client|unknown|tbd)\s*\.?\s*$/i;
const RE_PREFIX = /^(re|fw|fwd):\s*/i;
const PHOTOGRAPHY_INQUIRY = /^photography\s+inquiry:\s*(.*)$/i;

export type InquiryCoupleNameSources = {
  threadTitle: string;
  latestInboundBody: string;
  snippet: string;
  sender: string;
};

export type InquiryCoupleNameResult = {
  coupleNames: string;
  leadClientName: string;
};

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function isWeakCouplePlaceholder(s: string): boolean {
  const t = s.trim();
  if (t.length < 2) return true;
  if (/^(our\s+wedding|new inquiry|inquiry|hello|hi there|unknown)$/i.test(t)) return true;
  if (WEAK_TAIL.test(t)) return true;
  if (/\bpartner\b/i.test(t) && t.split(/\s+/).length <= 4) return true;
  return false;
}

/**
 * Strip common email subject boilerplate and take the name segment before date/location (em/en dash).
 */
export function extractCoupleSegmentFromInquiryTitle(raw: string): string | null {
  let s = raw.replace(RE_PREFIX, "").trim();
  if (!s) return null;

  const m = s.match(PHOTOGRAPHY_INQUIRY);
  if (m?.[1] != null) {
    s = m[1].trim();
  }

  // First segment before em dash, en dash, or spaced " – " / " - " (prefer long dash first).
  const splitEm = s.split(/\s*—\s*/);
  const splitEn = s.split(/\s*–\s*/);
  let head = s;
  if (splitEm.length > 1) head = splitEm[0]!.trim();
  else if (splitEn.length > 1) head = splitEn[0]!.trim();
  else {
    const asc = s.split(/\s+-\s+/);
    if (asc.length > 1) head = asc[0]!.trim();
  }

  head = head.replace(/^["'«»]+|["'«»]+$/g, "").trim();
  head = head.replace(/\s{2,}/g, " ");

  if (!head || isWeakCouplePlaceholder(head)) return null;
  return head;
}

function firstMeaningfulBodyLine(body: string): string | null {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length > 200) break;
    if (/^>|On .+wrote:/i.test(line)) continue;
    if (isWeakCouplePlaceholder(line)) continue;
    if (line.length < 3) continue;
    return line;
  }
  return null;
}

/** Display name from `Name <email@>` or bare email. */
export function extractLeadNameFromSender(sender: string): string | null {
  const s = sender.trim();
  if (!s) return null;
  const angle = s.match(/^([^<]+)</);
  if (angle?.[1]) {
    const name = angle[1].replace(/^["']+|["']+$/g, "").trim();
    if (name && !/^[\w.+-]+@[\w.-]+$/.test(name)) return truncate(name, 200);
  }
  return null;
}

function defaultLeadFromCouple(couple: string): string {
  const parts = couple
    .split(/\s*(?:&|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 1) return truncate(parts[0]!, 200);
  return truncate(couple, 200);
}

/**
 * Precedence:
 * 1. Parsed inquiry subject (Photography Inquiry: … — …)
 * 2. Whole thread title if not weak (after light trim)
 * 3. First meaningful inbound body line (not weak)
 * 4. Snippet (not weak)
 * 5. "New inquiry"
 *
 * Lead: sender display name when confident, else first name in couple string.
 */
export function extractCoupleNamesForNewInquiry(sources: InquiryCoupleNameSources): InquiryCoupleNameResult {
  const title = sources.threadTitle?.trim() ?? "";
  const body = sources.latestInboundBody?.trim() ?? "";
  const snippet = sources.snippet?.trim() ?? "";

  let couple: string | null = extractCoupleSegmentFromInquiryTitle(title);

  if (couple == null && title && !isWeakCouplePlaceholder(title)) {
    couple = truncate(title, 200);
  }

  if (couple == null || isWeakCouplePlaceholder(couple)) {
    const line = firstMeaningfulBodyLine(body);
    if (line && !isWeakCouplePlaceholder(line)) {
      couple = truncate(line, 200);
    }
  }

  if (couple == null || isWeakCouplePlaceholder(couple)) {
    if (snippet && !isWeakCouplePlaceholder(snippet)) {
      couple = truncate(snippet, 200);
    }
  }

  if (couple == null || isWeakCouplePlaceholder(couple)) {
    couple = "New inquiry";
  }

  couple = truncate(couple, MAX_COUPLE_LEN);

  const leadFromSender = extractLeadNameFromSender(sources.sender ?? "");
  const leadClientName =
    leadFromSender && !isWeakCouplePlaceholder(leadFromSender)
      ? truncate(leadFromSender, MAX_COUPLE_LEN)
      : defaultLeadFromCouple(couple);

  return {
    coupleNames: couple,
    leadClientName: truncate(leadClientName, MAX_COUPLE_LEN),
  };
}
