/**
 * Phase 8 Step 8E — operator escalation delivery triage (`execute_v3.md`).
 *
 * Branches on `escalation_requests.operator_delivery`:
 * - urgent_now → WhatsApp to `settings.admin_mobile_number`
 * - batch_later → hold for digest (no immediate ping; logged only)
 * - dashboard_only → queue for dashboard (no WhatsApp)
 */
import {
  inngest,
  OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT,
  type OperatorEscalationDeliveryPolicy,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { sendWhatsAppMessage } from "../../_shared/twilio.ts";

function normalizePhone(raw: string): string {
  return raw
    .replace(/^whatsapp:/i, "")
    .replace(/[\s\-\(\)\.]/g, "")
    .trim();
}

export const operatorEscalationDeliveryFunction = inngest.createFunction(
  { id: "operator-escalation-delivery", name: "Operator escalation delivery (Step 8E)" },
  { event: OPERATOR_ESCALATION_PENDING_DELIVERY_V1_EVENT },
  async ({ event, step }) => {
    const d = event.data;
    if (d.schemaVersion !== 1) {
      return { skipped: true as const, reason: "schema_version" };
    }

    const policy = d.operatorDelivery as OperatorEscalationDeliveryPolicy;

    if (policy === "dashboard_only") {
      await step.run("hold-dashboard-only", async () => {
        console.log(
          `[operator-escalation-delivery] dashboard_only escalation=${d.escalationId} tenant=${d.photographerId}`,
        );
      });
      return { policy: "dashboard_only" as const, escalationId: d.escalationId };
    }

    if (policy === "batch_later") {
      await step.run("hold-batch-later", async () => {
        console.log(
          `[operator-escalation-delivery] batch_later escalation=${d.escalationId} tenant=${d.photographerId}`,
        );
      });
      return { policy: "batch_later" as const, escalationId: d.escalationId };
    }

    const twilioSid = await step.run("send-urgent-whatsapp", async () => {
      const { data: row, error } = await supabaseAdmin
        .from("photographers")
        .select("settings")
        .eq("id", d.photographerId)
        .single();

      if (error) throw new Error(error.message);

      const settings = (row?.settings ?? {}) as Record<string, unknown>;
      const to = normalizePhone(String(settings.admin_mobile_number ?? ""));
      if (!to) {
        console.warn(
          `[operator-escalation-delivery] urgent_now skipped: missing admin_mobile_number for ${d.photographerId}`,
        );
        return null;
      }

      const body = d.questionBody.slice(0, 1600);
      return await sendWhatsAppMessage(to, body);
    });

    return {
      policy: "urgent_now" as const,
      escalationId: d.escalationId,
      twilio_sid: twilioSid,
    };
  },
);
