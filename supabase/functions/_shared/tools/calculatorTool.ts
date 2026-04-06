import type { AgentResult } from "../../../../src/types/agent.types.ts";
import {
  CalculatorToolInputSchema,
  type CalculatorToolInput,
} from "./schemas.ts";

function computeResult(input: CalculatorToolInput): number {
  const { operation, values } = input;
  switch (operation) {
    case "sum":
      return values.reduce((a, b) => a + b, 0);
    case "product":
      return values.reduce((a, b) => a * b, 1);
    case "min":
      return Math.min(...values);
    case "max":
      return Math.max(...values);
    case "mean":
      return values.reduce((a, b) => a + b, 0) / values.length;
    default: {
      const _x: never = operation;
      return _x;
    }
  }
}

/**
 * `toolCalculator` — deterministic finite-number ops. No I/O; echoes `photographerId` for audit only.
 */
export async function executeCalculatorTool(
  input: unknown,
  photographerId: string,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = CalculatorToolInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      };
    }

    const d = parsed.data;
    const result = computeResult(d);
    if (!Number.isFinite(result)) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: "Numeric result is not finite",
      };
    }

    return {
      success: true,
      facts: {
        tool: "calculator",
        operation: d.operation,
        valueCount: d.values.length,
        result,
        photographerId,
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
