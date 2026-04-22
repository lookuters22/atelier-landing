# V3 Operator Ana — Project / Inquiry Multi-Type Semantics (Slice)

> **Status:** Ready to implement. Narrow-scope correctness slice.
> **Goal:** Make every operator retrieval and every operator-widget answer **project-type-aware**, so wedding, commercial, video, and other project types are handled as first-class peers rather than "wedding + fallback." Eliminate the wedding-default bleed into non-wedding answers.
> **Category:** Correctness. Not a new capability; a reliability / language-accuracy fix.
> **Depends on:**
> - `V3_PRODUCTION_MEMORY_SCOPE_PLAN.md` — `scope` and `project_type` columns on the `memories` / `weddings` tables.
> - `V3_OPERATOR_ANA_DOMAIN_FIRST_RETRIEVAL_PLAN.md` — the architectural frame for thin shared context + domain handlers.
> **Pairs naturally with:** `V3_OPERATOR_ANA_PROJECTS_DOMAIN_FIRST_EXECUTION_SLICE.md` (ship alongside or immediately after).

---

## 1. Problem statement

The product supports wedding, commercial, video, and other project types. The data model (`weddings.project_type`) already reflects this. **The runtime — and the system prompt — do not.** Specifically:

- Widget language defaults to wedding phrasing ("the couple," "the wedding," "the ceremony") even when the focused or referenced project is `project_type='commercial'` or `'video'`.
- The CRM digest and focused-project-facts formatter do not emit `project_type` prominently; the LLM has to infer it.
- Memory retrieval can surface a wedding-scoped memory in response to a commercial-project question because the selector treats `scope='project'` rows uniformly; only the `wedding_id` differs, but the *type* of the project that memory belongs to is not a first-class filter in the prompt.
- Playbook rules with wedding-specific instruction text (e.g., "wedding day timeline must be signed 72 h before") appear alongside rules that apply to all projects, with no visible distinction in the rendered block.

The symptom operators see: Ana treats a commercial shoot like a wedding, a video project like a wedding, or misses a rule that genuinely applies across types because it was authored with wedding vocabulary.

This slice makes project type first-class end-to-end.

---

## 2. Current repo behavior

Baseline to preserve unless a line below says otherwise:

- `weddings.project_type` exists and is backfilled; the schema is correct.
- `fetchAssistantFocusedProjectFacts.ts` loads `project_type` on the row but the formatter does not prominently surface it.
- `fetchAssistantCrmDigest.ts` loads `couple_names, stage, wedding_date` (per prior analysis) — `project_type` is not in the SELECT set.
- The memory scope model already separates `scope='project' | 'person' | 'studio'`, and `scope='project'` memories carry `wedding_id`. The memory selector returns rows without distinguishing the *project type* of the wedding they belong to.
- The system prompt `OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT` uses wedding-adjacent language in its examples; it does not instruct the model to honor `project_type`.
- The persona writer (separate file: `persona.ts`) has its own wedding voice corpus and is **out of scope** for this slice — its voice posture is intentional.

---

## 3. Proposed architecture

Three changes. All additive to the existing schema; runtime changes are prompt + retrieval discipline.

### Change 1 — `project_type` becomes a first-class field in every project-touching retrieval

Every handler or formatter that returns data attached to a specific project must include `project_type` in its output. This aligns with the domain-first plan's "rich outputs reduce chaining" rule — having `project_type` on the first handler's output removes the need for a second call just to learn the type and frame the answer correctly.

- `fetchAssistantFocusedProjectFacts.ts` — add `project_type` to the SELECT and to the emitted block; emit it on the first line of the block (so the model sees it before reading facts).
- `fetchAssistantCrmDigest.ts` — add `project_type` to the SELECT; group the digest by type (see Change 2).
- `operator_lookup_projects` — already exists; ensure its output shape includes `project_type` on every candidate and on the resolved project.
- `operator_lookup_project_details` (new, per domain-first plan) — return `project_type` as a top-level field.
- Memory retrieval (`operator_lookup_memories` or the existing selector) — when returning `scope='project'` memories, include the project's `project_type` in the row metadata.

### Change 2 — CRM digest groups by project type

In the rendered digest block, weddings are grouped by `project_type`:

```
## CRM digest

### Wedding projects (6 recent)
  - Sophia Thorne & James Beckett — booked — Sep 26 — Capri
  - Clara Hartwell & Elliot Beaumont — prep — Jun 6 — Sorrento
  ...

### Commercial projects (3 recent)
  - Nocera brand campaign — consultation — Oct 10 — Milan
  ...

### Video projects (2 recent)
  - Matera documentary — booked — Nov 14 — Matera
  ...

### Other projects (1 recent)
  - Architectural shoot — inquiry — TBD — Porto
```

The grouping makes cross-type ambiguity visible to the LLM; when the operator asks about "the Milan project," the model can see that the Milan match is a commercial project and answer in commercial vocabulary.

### Change 3 — System prompt gains a project-type discipline section

One paragraph added to `OPERATOR_STUDIO_ASSISTANT_SYSTEM_PROMPT`:

> **Project type discipline.** Every project in this studio has a `project_type`: `wedding`, `commercial`, `video`, or `other`. Honor the type of the project the operator is asking about. Do not use wedding-specific vocabulary ("the couple," "the wedding day," "the ceremony," "bride," "groom") unless `project_type === 'wedding'` or the operator's own message used that vocabulary. For `commercial`, refer to the *brand* or *client*. For `video`, refer to the *video project* or *production*. For `other`, use *the project* or *the client*. If retrieved data includes a memory, playbook rule, or thread attached to a project, the project's type constrains how you frame the answer. Never carry wedding-shaped phrasing into a non-wedding answer.

### Change 4 — Anti-bleed rules for memory and playbook retrieval

Two small retrieval-time guards.

**Memory:** when the operator's question is scoped to a specific `focusedWeddingId` and that project has a type, `operator_lookup_memories` (or the existing selector) filters project-scoped memories to those whose wedding has the matching `project_type`. Studio-scoped memories are always eligible. Person-scoped memories are eligible when the person participates in that project. Wedding-scoped memories from *other* wedding-type projects are never returned for a commercial question unless the operator explicitly asks a cross-project lookup.

**Playbook:** playbook rules that are clearly wedding-specific (authored text mentions wedding-only terms) get a `type_hint` tag when loaded, either by convention (an operator tags them with `topic` containing "wedding") or by a small heuristic in the formatter. The formatter renders wedding-specific rules in a separate sub-section so the model can see they only apply to wedding projects. This is a cheap UX aid, not a schema change.

### What does not change

- `project_type` column already exists; no migration in this slice.
- Propose → confirm write paths are untouched.
- Memory scope semantics (from the scope plan) are untouched.
- Persona writer voice corpus is untouched.
- Existing three tool handlers keep their current shapes; they only gain `project_type` on their output rows.

---

## 4. Files likely to change

### Modified

- `supabase/functions/_shared/context/fetchAssistantFocusedProjectFacts.ts` — add `project_type` to SELECT and to the rendered output.
- `supabase/functions/_shared/context/fetchAssistantCrmDigest.ts` — add `project_type` to SELECT.
- `supabase/functions/_shared/operatorStudioAssistant/formatAssistantContextForOperatorLlm.ts` — render digest grouped by type; render focused-project facts with type on the first line; add wedding-specific-rules subsection when applicable.
- `supabase/functions/_shared/operatorStudioAssistant/completeOperatorStudioAssistantLlm.ts` — add the project-type discipline paragraph to the system prompt.
- `supabase/functions/_shared/operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts` — ensure `project_type` is in the output of `operator_lookup_projects` for every wedding/project candidate row.
- `supabase/functions/_shared/memory/selectRelevantMemoriesForDecisionContext.ts` (or the assistant-side equivalent) — add a `projectTypeFilter` parameter and honor it when a focused project type is known.

### New (small)

- `supabase/functions/_shared/operatorStudioAssistant/projectTypeLabel.ts` — a small pure helper that returns human-readable labels for each project type ("wedding," "commercial shoot," "video project," "project") and the pronoun-safe phrasing ("the couple" only for wedding; otherwise "the client"). Centralizes language choices so prompt consistency is enforced by one file.

### Not touched

- `weddings` schema (column already exists).
- Memory scope schema.
- Playbook rules schema (no new `project_type` column on rules; the heuristic is prompt-side).
- Persona writer files.
- Any tenant isolation / RLS policy.

---

## 5. Acceptance criteria

1. **Focused project facts render `project_type` on the first line** of the block, verbatim in the token stream the LLM sees.
2. **CRM digest is grouped by project type.** Sections exist per type; sections with zero rows are omitted cleanly.
3. **System prompt contains the project-type discipline paragraph** verbatim.
4. **`operator_lookup_projects` output carries `project_type`** on every wedding/project candidate (asserted by tool-output shape test).
5. **Memory selector honors `projectTypeFilter`** when supplied; wedding-scope memories on a wedding-type project are not returned for a commercial focused project.
6. **End-to-end anti-bleed:** a fixture operator question about a commercial project produces a reply that contains no wedding-vocabulary terms from a banlist (`wedding day`, `the couple`, `ceremony`, `bride`, `groom`), except when those strings appeared in the operator's own prior turn.
7. **Cross-type list handling:** when the digest contains projects in multiple types, the model's reply references them by type when naming them (e.g., "the commercial project in Milan" rather than "the Milan wedding").
8. **No regression on wedding-only answers:** for fixtures where every referenced project is wedding-type, the model's tone and vocabulary are indistinguishable from baseline.

---

## 6. Tests that should exist

### Unit

- **`projectTypeLabel.test.ts`** — every `project_type` value maps to the expected human label and pronoun-safe phrasing; unknown types map to a safe fallback ("project" / "the client").
- **`fetchAssistantFocusedProjectFacts.test.ts`** (extended) — output contains `project_type` and the type is the first visible field.
- **`fetchAssistantCrmDigest.test.ts`** (extended) — output groups rows by type; empty groups are not rendered.
- **Memory selector test** — project-scoped memories are filtered by `project_type` when `projectTypeFilter` is supplied; studio and person scopes are unaffected.

### Integration (mocked LLM)

- **Commercial focused project fixture:** `focusedWeddingId` points at a `project_type='commercial'` wedding. Assert: the rendered user-message contains `project_type: commercial`; the mocked LLM response's `reply` has zero hits against the wedding-vocabulary banlist.
- **Video focused project fixture:** same, with `project_type='video'`.
- **Mixed digest fixture:** digest has 2 weddings + 1 commercial + 1 video. Operator asks "tell me about the Milan one" and only the Milan commercial is in Milan. Assert: the reply refers to it as a commercial project.
- **Anti-bleed memory fixture:** wedding-scope memory about a *different* project appears in the candidate pool; it is filtered out for a commercial question and does not appear in the reply.

### Regression

- Every existing widget test that uses wedding-type fixtures passes unchanged.
- System prompt golden test includes the new paragraph.

---

## 7. Risks / tradeoffs

- **Prompt length.** Adding the discipline paragraph and grouped digest increases stable-band token count by a small amount. Caching slice mitigates; total growth should be < 300 tokens.
- **False positives in the banlist.** Wedding vocabulary might appear legitimately (e.g., a commercial client has an upcoming wedding mentioned by the operator). The test banlist exempts words that appeared in the operator's own prior turn to handle this. Still, operators may occasionally see Ana avoid a word she could have used. Accepted tradeoff for reliability.
- **Heuristic for "wedding-specific rule" is imperfect.** The subsection grouping relies on `topic` conventions; some rules that are genuinely wedding-specific may not be flagged. Acceptable: the prompt discipline catches most of the remaining bleed. A future slice can add a first-class `applies_to_project_types` column on `playbook_rules` if needed.
- **Operators asking cross-type questions.** "Have we ever shot a commercial for a wedding client before?" must still work. The anti-bleed rules filter by default, but the handler permits opt-out when the operator explicitly asks a cross-type question. The domain-first plan's `operator_lookup_projects` can already span types.
- **Migration risk.** Minimal: all changes are additive (new fields in outputs, new section in prompt, new filter parameter with safe default). No schema change. No existing data rewrites.

---

## 8. Rollout guidance

- **Env flag:** `OPERATOR_ASSISTANT_PROJECT_TYPE_SEMANTICS_V1`. Default off on merge; flip to on in staging; observe the anti-bleed regression fixtures pass in production telemetry before flipping in prod.
- **Ship sequencing:** land alongside or immediately after the Projects domain-first execution slice. The two are mutually reinforcing — the execution slice introduces the project-focused handler path; this slice ensures the path is type-safe.
- **Telemetry:** structured log per call with `focused_project_type` and `digest_types_present` so operators' real usage is visible.
- **Rollback:** flip the flag off. The formatter falls back to the ungrouped digest and the system prompt reverts to the paragraph-free version.

---

## Appendix — One-line summary

**Surface `project_type` everywhere it exists, group the CRM digest by type, filter project-scoped memories by type, and add a one-paragraph project-type discipline rule to the system prompt so wedding vocabulary never bleeds into commercial, video, or other project answers.**
