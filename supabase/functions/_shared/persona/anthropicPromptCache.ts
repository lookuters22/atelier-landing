/**
 * Anthropic Messages API — prompt caching (ephemeral system block).
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 */
export const ANTHROPIC_PROMPT_CACHING_BETA = "prompt-caching-2024-07-31";

/** System prompt as a single cacheable text block (shared by persona.ts tool loop + personaAgent). */
export function cachedEphemeralSystemBlocks(systemText: string) {
  return [
    {
      type: "text" as const,
      text: systemText,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export function anthropicMessagesHeadersWithPromptCaching(
  apiKey: string,
  anthropicVersion = "2023-06-01",
): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": anthropicVersion,
    "Content-Type": "application/json",
    "anthropic-beta": ANTHROPIC_PROMPT_CACHING_BETA,
  };
}
