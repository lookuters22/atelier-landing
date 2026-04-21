/**
 * Bounded text serialization of {@link AssistantContext} for operator-only LLM prompts.
 * Not used by reply-in-thread / persona paths.
 */
import type { AssistantContext } from "../../../../src/types/assistantContext.types.ts";

const MAX_PLAYBOOK_RULES = 24;
const MAX_PLAYBOOK_INSTRUCTION_CHARS = 400;
const MAX_MEMORY_SNIPPETS = 8;
const MAX_MEMORY_SNIPPET_CHARS = 320;
const MAX_KB_ROWS = 5;
const MAX_KB_CONTENT_CHARS = 500;
const MAX_DIGEST_WEDDINGS = 12;
const MAX_DIGEST_PEOPLE = 12;

function clip(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}...`;
}

/**
 * Produces compact markdown-style blocks for the model (deterministic ordering).
 */
export function formatAssistantContextForOperatorLlm(ctx: AssistantContext): string {
  const parts: string[] = [];

  parts.push("## Operator question");
  parts.push(clip(ctx.queryText, 8000));
  parts.push("");

  parts.push("## Effective scope");
  parts.push(`- Studio (tenant): ${ctx.photographerId}`);
  parts.push(`- Focused wedding (validated): ${ctx.focusedWeddingId ?? "none"}`);
  parts.push(`- Focused person (validated): ${ctx.focusedPersonId ?? "none"}`);
  parts.push("");

  parts.push("## Playbook (effective rules - authoritative over memory)");
  const rules = ctx.playbookRules.slice(0, MAX_PLAYBOOK_RULES);
  if (rules.length === 0) {
    parts.push("(no active rules returned)");
  } else {
    for (const r of rules) {
      const line = `- **${r.action_key}** (${r.topic}): ${clip(r.instruction ?? "", MAX_PLAYBOOK_INSTRUCTION_CHARS)}`;
      parts.push(line);
    }
  }
  parts.push("");

  parts.push("## Durable memory (supporting - titles/summaries; may be incomplete)");
  const mem = ctx.selectedMemories.slice(0, MAX_MEMORY_SNIPPETS);
  if (mem.length === 0) {
    parts.push("(none selected)");
  } else {
    for (const m of mem) {
      parts.push(
        `- **${m.title}** (${m.type}): ${clip(`${m.summary}\n${m.full_content ?? ""}`, MAX_MEMORY_SNIPPET_CHARS)}`,
      );
    }
  }
  parts.push("");

  parts.push("## Global knowledge excerpts (tenant KB - supporting)");
  const kb = ctx.globalKnowledge.slice(0, MAX_KB_ROWS);
  if (kb.length === 0) {
    parts.push("(none retrieved)");
  } else {
    for (const row of kb) {
      const r = row as Record<string, unknown>;
      const dt = String(r.document_type ?? "");
      const content = clip(String(r.content ?? ""), MAX_KB_CONTENT_CHARS);
      parts.push(`- **${dt}**: ${content}`);
    }
  }
  parts.push("");

  parts.push("## CRM digest (structured - recent projects & people)");
  const w = ctx.crmDigest.recentWeddings.slice(0, MAX_DIGEST_WEDDINGS);
  const p = ctx.crmDigest.recentPeople.slice(0, MAX_DIGEST_PEOPLE);
  parts.push("### Recent weddings");
  if (w.length === 0) parts.push("(none)");
  else {
    for (const x of w) {
      parts.push(`- ${x.couple_names} - ${x.stage} - ${x.wedding_date ?? "no date"} - id \`${x.id}\``);
    }
  }
  parts.push("### Recent people");
  if (p.length === 0) parts.push("(none)");
  else {
    for (const x of p) {
      parts.push(`- ${x.display_name} (${x.kind}) - id \`${x.id}\``);
    }
  }
  parts.push("");

  parts.push("## Retrieval debug");
  parts.push("```json");
  parts.push(
    JSON.stringify({
      fingerprint: ctx.retrievalLog.queryDigest.fingerprint,
      scopesQueried: ctx.retrievalLog.scopesQueried,
      selectedMemoryIds: ctx.retrievalLog.selectedMemoryIds,
      globalKnowledgeRowCount: ctx.retrievalLog.globalKnowledgeRowCount,
      focus: ctx.retrievalLog.focus,
    }),
  );
  parts.push("```");

  return parts.join("\n");
}
