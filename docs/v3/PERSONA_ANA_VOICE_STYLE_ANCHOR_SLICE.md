# Persona — Ana voice style anchor (first pass)

## What changed

- **Examples file:** [supabase/functions/_shared/prompts/personaStudioVoiceExamples.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/prompts/personaStudioVoiceExamples.ts) — few-shot **style only** (cadence, warmth, structure, boundary-setting). Explicitly **not** factual sources; no dates/prices from examples should be copied into drafts.
- **System prompt:** [supabase/functions/_shared/persona/personaAgent.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.ts) — `buildPersonaStyleExamplesPromptSection()` is concatenated into `buildPersonaSystemPrompt` after strict business rules and a **softened** Ana identity line (generic “luxury / premium” lead-in removed so it does not fight the examples). Orchestrator facts remain **only** in the user message; **`selectedMemories` / `globalKnowledge` are still not passed** to the writer.

## Proof

- Formatter: [supabase/functions/_shared/prompts/personaStudioVoiceExamples.test.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/prompts/personaStudioVoiceExamples.test.ts)
- Full system prompt path: [supabase/functions/_shared/persona/personaAgent.voiceAnchor.test.ts](C:/Users/Despot/Desktop/wedding/supabase/functions/_shared/persona/personaAgent.voiceAnchor.test.ts)

## Illustrative before / after (copy only)

- **Before:** Identity leaned on “luxury” / “premium” adjectives with no few-shot anchor; prose could read generic.
- **After:** Same safety stack; system prompt adds labeled Ana examples as the **primary** cadence anchor, with disclaimers that facts come from the orchestrator-approved user block only.
