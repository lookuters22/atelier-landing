import type { AgentResult } from "../../../../src/types/agent.types.ts";
import type { ToolEscalateInput } from "./schemas.ts";
import { ToolEscalateInputSchema } from "./schemas.ts";

/**
 * `toolEscalate` — Step 6D.1 validation-only slice: accepts the escalation-ready shape only
 * (no bare question). Does not insert into `escalation_requests` yet.
 */
export async function executeToolEscalate(
  input: ToolEscalateInput,
  photographerId: string,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = ToolEscalateInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      };
    }

    const d = parsed.data;
    return {
      success: true,
      facts: {
        tool: "toolEscalate",
        actionKey: d.actionKey,
        photographerId,
        escalation: d.escalation,
        justification: d.justification,
      },
      confidence: 1,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      facts: {},
      confidence: 0,
      error: message,
    };
  }
}
