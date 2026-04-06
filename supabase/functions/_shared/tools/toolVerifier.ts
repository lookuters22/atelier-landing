import type { AgentResult } from "../../../../src/types/agent.types.ts";
import {
  type VerifierBlockTelemetryAttribution,
  logBlocksByVerifier,
} from "../telemetry/telemetryV315Step115a.ts";
import { ToolVerifierInputSchema } from "./schemas.ts";

const RULE_ID = "broadcast_risk_high_blocks_auto" as const;

/**
 * `toolVerifier` — mandatory gate before execution (execute_v3 Step 6D).
 *
 * **Implemented rule (narrow slice):** if `broadcastRisk === "high"`, block `auto` execution
 * for this message (message-level gate; does not mutate thread overrides).
 */
export async function executeToolVerifier(
  input: unknown,
  photographerId: string,
  telemetry?: VerifierBlockTelemetryAttribution,
): Promise<AgentResult<Record<string, unknown>>> {
  try {
    const parsed = ToolVerifierInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        facts: {},
        confidence: 0,
        error: parsed.error.message,
      };
    }

    const d = parsed.data;
    const blocked =
      d.broadcastRisk === "high" && d.requestedExecutionMode === "auto";

    if (blocked) {
      logBlocksByVerifier({
        metric: "blocks_by_verifier",
        rule_id: RULE_ID,
        photographer_id: photographerId,
        broadcast_risk: d.broadcastRisk,
        requested_execution_mode: d.requestedExecutionMode,
        thread_id: telemetry?.thread_id ?? null,
        wedding_id: telemetry?.wedding_id ?? null,
        source_event: telemetry?.source_event ?? null,
        risk_class: telemetry?.risk_class ?? d.broadcastRisk,
      });
      return {
        success: false,
        facts: {
          verifier: "toolVerifier",
          ruleId: RULE_ID,
          broadcastRisk: d.broadcastRisk,
          requestedExecutionMode: d.requestedExecutionMode,
          photographerId,
          escalation: d.escalation,
        },
        confidence: 1,
        error: "broadcast_risk_high_blocks_auto_execution",
      };
    }

    return {
      success: true,
      facts: {
        verifier: "toolVerifier",
        ruleId: "broadcast_risk_gate_passed",
        broadcastRisk: d.broadcastRisk,
        requestedExecutionMode: d.requestedExecutionMode,
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
