import type { EffectivePlaybookRule } from "../types/decisionContext.types.ts";
import type { AssistantPlaybookCoverageSummary } from "../types/assistantContext.types.ts";

const MAX_KEYWORD_HINTS = 40;
const MAX_ACTION_KEY_TOKEN_HINTS = 28;
const MIN_KEYWORD_LEN = 4;

const STOP = new Set(
  `the and for with that this your are from not can will was were been has have had
does did was were being have having about into onto over such only just also than
then them they their what when where which while will with within without would
very much more most some same each both few such than then there these those
very upon onto ever even ever every from down after before because between under
after again here there where every each both another other such only own same so
if may might must shall should could can need needs using used use
per any all out off our us you its it an as at be do go if in is no of on or ox
to up we
a b c d e f g h i j k l m n o p q r s t u v w x y z`.split(/\s+/),
);

function uniqueSorted(strs: string[]): string[] {
  return [...new Set(strs.map((s) => s.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function tokensFromActionKey(actionKey: string): string[] {
  const t = String(actionKey ?? "")
    .toLowerCase()
    .split(/[_\-./\s]+/g)
    .map((p) => p.replace(/[^a-z0-9]/g, ""))
    .filter((p) => p.length >= 2);
  return t;
}

function tokensFromText(text: string): string[] {
  const s = String(text ?? "").toLowerCase();
  const out: string[] = [];
  const re = /[a-z0-9]{4,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push(m[0]);
  }
  return out;
}

/**
 * Deterministic, compact index over **effective** (post–case-exception) playbook rules.
 * Used only to answer “what do my rules cover?” style questions; does not replace the line-by-line list.
 */
export function deriveAssistantPlaybookCoverageSummary(
  rules: EffectivePlaybookRule[],
): AssistantPlaybookCoverageSummary {
  const totalActiveRules = rules.length;
  if (totalActiveRules === 0) {
    return {
      totalActiveRules: 0,
      uniqueTopics: [],
      uniqueActionKeys: [],
      topicCounts: [],
      scopes: [],
      channels: [],
      decisionModes: [],
      sourceTypes: [],
      confidenceLabels: [],
      actionKeyTokenHints: [],
      coverageKeywordHints: [],
      rulesWithCaseException: 0,
    };
  }

  const topicMap = new Map<string, number>();
  const actionKeys: string[] = [];
  const keywordFreq = new Map<string, number>();
  const keyTokens = new Set<string>();

  let rulesWithCaseException = 0;

  for (const r of rules) {
    if (r.appliedAuthorizedExceptionId) rulesWithCaseException += 1;
    const topic = String(r.topic ?? "").trim();
    if (topic) {
      topicMap.set(topic, (topicMap.get(topic) ?? 0) + 1);
    }
    if (r.action_key) actionKeys.push(String(r.action_key));

    for (const t of tokensFromActionKey(r.action_key)) {
      keyTokens.add(t);
    }
    for (const t of tokensFromText(`${r.topic} ${r.instruction ?? ""}`)) {
      if (STOP.has(t)) continue;
      keywordFreq.set(t, (keywordFreq.get(t) ?? 0) + 1);
    }
  }

  const topicCounts = [...topicMap.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => a.topic.localeCompare(b.topic));

  const keywordSorted = [...keywordFreq.keys()].sort((a, b) => {
    const fa = keywordFreq.get(a) ?? 0;
    const fb = keywordFreq.get(b) ?? 0;
    if (fb !== fa) return fb - fa;
    return a.localeCompare(b);
  });
  const coverageKeywordHints = keywordSorted
    .filter((w) => w.length >= MIN_KEYWORD_LEN)
    .slice(0, MAX_KEYWORD_HINTS);

  const actionKeyTokenHints = uniqueSorted([...keyTokens]).slice(0, MAX_ACTION_KEY_TOKEN_HINTS);

  return {
    totalActiveRules,
    uniqueTopics: topicCounts.map((x) => x.topic),
    uniqueActionKeys: uniqueSorted(actionKeys),
    topicCounts,
    scopes: uniqueSorted(rules.map((r) => String(r.scope ?? "")).filter(Boolean)),
    channels: uniqueSorted(rules.map((r) => String(r.channel ?? "")).filter(Boolean)),
    decisionModes: uniqueSorted(rules.map((r) => String(r.decision_mode ?? "")).filter(Boolean)),
    sourceTypes: uniqueSorted(rules.map((r) => String(r.source_type ?? "")).filter(Boolean)),
    confidenceLabels: uniqueSorted(rules.map((r) => String(r.confidence_label ?? "")).filter(Boolean)),
    actionKeyTokenHints,
    coverageKeywordHints,
    rulesWithCaseException,
  };
}

export const EMPTY_ASSISTANT_PLAYBOOK_COVERAGE_SUMMARY: AssistantPlaybookCoverageSummary =
  deriveAssistantPlaybookCoverageSummary([]);
