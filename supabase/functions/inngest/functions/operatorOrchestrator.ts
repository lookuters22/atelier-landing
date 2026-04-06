/**
 * Operator WhatsApp orchestrator (execute_v3 Phase 8 Step 8C).
 *
 * Replaces the broad internal-concierge *model* for the operator lane: `operator/whatsapp.inbound.v1`.
 * Legacy `ai/intent.internal_concierge` remains registered for strangler compatibility (Phase 0D).
 *
 * Narrow capabilities:
 * - Slash commands (/help, /pending)
 * - Answers from verified DB tools only
 * - Short blocked-action questions via `record_operator_escalation` → `escalation_requests`
 * - Resolves photographer replies into open `escalation_requests`
 * - Optional context notes → `memories` (operator_whatsapp_note)
 * - Step 8E: `delivery_policy` on escalations → triage worker (urgent WhatsApp vs batch vs dashboard-only);
 *   orchestrator skips duplicate WhatsApp when an escalation row is created.
 * - Step 9A: answered escalations get `learning_outcome` via `classifyEscalationLearningOutcome` (one classifier module).
 * - Step 9B / 9B.1: `writebackEscalationLearning` + strict single storage target (playbook vs memory vs documents audit).
 * - Step 9E: resolution text is written only in the writeback primary store — not duplicated on `escalation_requests` before writeback.
 * - Step 10D: deduped `Awaiting reply:` tasks via `create_awaiting_reply_task`; inbound disposition (answered/deferral/unresolved) when no open escalation.
 */
import { classifyAwaitingReplyDisposition } from "../../_shared/classifyAwaitingReplyDisposition.ts";
import { classifyEscalationLearningOutcome } from "../../_shared/classifyEscalationLearningOutcome.ts";
import {
  applyAwaitingReplyDisposition,
  DEFERRAL_DUE_POLICY_DAYS,
  findEarliestOpenAwaitingReplyTask,
} from "../../_shared/operatorAwaitingReplyTask.ts";
import { writebackEscalationLearning } from "../../_shared/writebackEscalationLearning.ts";
import {
  inngest,
  WHATSAPP_OPERATOR_INBOUND_V1_EVENT,
} from "../../_shared/inngest.ts";
import { supabaseAdmin } from "../../_shared/supabase.ts";
import { sendWhatsAppMessage } from "../../_shared/twilio.ts";
import { handleOperatorDataToolCall } from "../../_shared/operatorDataTools.ts";

const MODEL = "gpt-4o-mini";
const OPERATOR_THREAD_EXTERNAL_KEY = "operator_whatsapp_inbound";
const OPERATOR_CHANNEL = "whatsapp_operator";
const MEMORY_DEPTH = 8;

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "query_weddings",
      description:
        "Search this studio's weddings by name or location keyword. Returns couple_names, wedding_date, stage, etc. Do not filter by stage when asking about a specific couple's status — search by name and read stage from rows.",
      parameters: {
        type: "object",
        properties: {
          search_term: {
            type: "string",
            description: "Single keyword: one first name or city. No phrases or status words.",
          },
          stage: {
            type: "string",
            description: "Only to list weddings at a stage (e.g. all booked). Not for one couple's status.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_clients",
      description: "Search clients for this studio by first name or email fragment.",
      parameters: {
        type: "object",
        properties: {
          search_term: { type: "string" },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_tasks",
      description: "Open or completed tasks for this studio.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "'open' or 'completed'. Default open." },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_pending_drafts",
      description: "Email drafts awaiting approval for this studio.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_open_escalations",
      description: "List open escalation requests (blocked actions / pending decisions).",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "record_operator_escalation",
      description:
        "When an action needs the photographer's explicit decision (discount, gift, delay, policy exception, banking). Ask ONE short question in question_body (max ~200 chars). Do not execute the action.",
      parameters: {
        type: "object",
        properties: {
          action_key: { type: "string", description: "e.g. discount_quote, delay_delivery, gift_album" },
          question_body: { type: "string" },
          delivery_policy: {
            type: "string",
            enum: ["urgent_now", "batch_later", "dashboard_only"],
            description:
              "urgent_now = ping WhatsApp now. batch_later = digest (no immediate ping). dashboard_only = inbox UI only.",
          },
          reason_code: { type: "string" },
          why_blocked: { type: "string" },
          missing_fact: { type: "string" },
          risk_class: { type: "string" },
          recommended_next_step: { type: "string" },
          recommended_resolution: { type: "string" },
          wedding_id: { type: "string" },
        },
        required: ["question_body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_awaiting_reply_task",
      description:
        "Create a deduped open task when you need a follow-up answer from the photographer on an important outbound matter. Requires explicit due_date (ISO 8601) from a stated deadline or workflow — never invent relative timings. Dedupes by same action_key + wedding.",
      parameters: {
        type: "object",
        properties: {
          action_key: {
            type: "string",
            description: "Short stable key for this ask (e.g. timeline_confirm, album_proof). Used in title and dedupe.",
          },
          wedding_id: { type: "string" },
          due_date: {
            type: "string",
            description: "Explicit due datetime ISO 8601 (from context or policy). Required.",
          },
        },
        required: ["action_key", "wedding_id", "due_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "capture_operator_context",
      description:
        "Store a durable offline note the photographer stated (e.g. met couple in London, timeline received on WhatsApp). Not for blocked pricing actions — use record_operator_escalation for those.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          full_content: { type: "string" },
          wedding_id: { type: "string" },
        },
        required: ["summary"],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are Ana's operator control channel on WhatsApp for one wedding studio.

STYLE:
- Extremely short replies (prefer under 320 characters). Plain text, no email formatting, no greetings/sign-offs.
- Only state facts returned by tools. If tools return nothing, say you couldn't find it in one sentence.

COMMANDS the photographer can send: /help (what you can do), /pending (open escalations).

BEHAVIOR:
- Use tools for weddings, clients, tasks, drafts, and open escalations. Never invent CRM data.
- For anything that changes money, legal commitment, or client-facing promises without a clear studio rule, call record_operator_escalation with one concise yes/no style question. Set delivery_policy: urgent_now for time-sensitive or risk; batch_later for non-urgent FYIs; dashboard_only when no ping is needed.
- For important follow-ups that need a photographer answer by a known date, use create_awaiting_reply_task with explicit due_date (ISO) — never invent relative dates.
- For "I already got the timeline", "I met them yesterday", "remember X for this wedding" — call capture_operator_context with a clear summary.
- SEARCH: use a single first name or city keyword in query_weddings / query_clients, not full sentences.

CONVERSATION HISTORY may follow; use it for pronouns.`;

type OaiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

async function callOpenAI(messages: OaiMessage[]): Promise<{
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 512,
      tools: TOOLS,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  return json.choices[0].message;
}

async function classifyEscalationResolution(
  questionBody: string,
  photographerReply: string,
): Promise<{ resolves: boolean; resolution_summary: string }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You decide if a photographer WhatsApp reply answers a pending escalation question. Return JSON only: {"resolves": boolean, "resolution_summary": string}. If resolves is true, resolution_summary must capture the operative decision in one short sentence.',
        },
        {
          role: "user",
          content: `Pending question:\n${questionBody}\n\nPhotographer reply:\n${photographerReply}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body}`);
  }

  const json = await res.json();
  const raw = json.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      resolves: Boolean(parsed.resolves),
      resolution_summary: String(parsed.resolution_summary ?? "").trim(),
    };
  } catch {
    return { resolves: false, resolution_summary: "" };
  }
}

async function getOperatorThreadId(photographerId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("threads")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("channel", OPERATOR_CHANNEL)
    .eq("external_thread_key", OPERATOR_THREAD_EXTERNAL_KEY)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabaseAdmin
    .from("threads")
    .insert({
      photographer_id: photographerId,
      wedding_id: null,
      channel: OPERATOR_CHANNEL,
      external_thread_key: OPERATOR_THREAD_EXTERNAL_KEY,
      kind: "other",
      title: "Operator WhatsApp",
    })
    .select("id")
    .single();

  if (error || !created) throw new Error(`operator thread: ${error?.message}`);
  return created.id as string;
}

const MAX_TOOL_ROUNDS = 4;

export const operatorOrchestratorFunction = inngest.createFunction(
  { id: "operator-whatsapp-orchestrator", name: "Operator — WhatsApp orchestrator (v1)" },
  { event: WHATSAPP_OPERATOR_INBOUND_V1_EVENT },
  async ({ event, step }) => {
    const data = event.data;
    if (data.schemaVersion !== 1 || data.lane !== "operator") {
      return { status: "skipped", reason: "unexpected_payload" };
    }

    const photographerId = data.photographerId;
    const operatorFromNumber = data.operatorFromNumber;
    const rawMessage = (data.rawMessage ?? "").trim();

    if (!photographerId || !rawMessage) {
      return { status: "skipped", reason: "missing_fields" };
    }

    const threadId = await step.run("resolve-operator-thread", () => getOperatorThreadId(photographerId));

    const pending = await step.run("fetch-latest-open-escalation", async () => {
      const { data: row } = await supabaseAdmin
        .from("escalation_requests")
        .select("id, question_body, created_at, action_key, wedding_id, reason_code, decision_justification")
        .eq("photographer_id", photographerId)
        .eq("thread_id", threadId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return row as {
        id: string;
        question_body: string;
        action_key: string;
        wedding_id: string | null;
        reason_code: string;
        decision_justification: unknown;
      } | null;
    });

    if (pending) {
      const decision = await step.run("classify-escalation-reply", () =>
        classifyEscalationResolution(pending.question_body, rawMessage),
      );

      if (decision.resolves && decision.resolution_summary) {
        const learningOutcome = await step.run("classify-escalation-learning-outcome", () =>
          classifyEscalationLearningOutcome({
            questionBody: pending.question_body,
            photographerReply: rawMessage,
            resolutionSummary: decision.resolution_summary,
            actionKey: pending.action_key,
            weddingId: pending.wedding_id,
          }),
        );

        await step.run("apply-escalation-resolution", async () => {
          const { error } = await supabaseAdmin
            .from("escalation_requests")
            .update({
              status: "answered",
              resolved_at: new Date().toISOString(),
              resolved_decision_mode: "auto",
              resolution_storage_target: null,
              resolution_text: null,
              learning_outcome: learningOutcome,
            })
            .eq("id", pending.id)
            .eq("photographer_id", photographerId);

          if (error) throw new Error(error.message);
        });

        const writeback = await step.run("writeback-escalation-learning", () =>
          writebackEscalationLearning(supabaseAdmin, {
            photographerId,
            escalationId: pending.id,
            learningOutcome,
            reasonCode: pending.reason_code,
            actionKey: pending.action_key,
            decisionJustification: pending.decision_justification,
            weddingId: pending.wedding_id,
            questionBody: pending.question_body,
            resolutionSummary: decision.resolution_summary,
          }),
        );

        const ack = await step.run("reply-escalation-ack", async () => {
          const line = `Recorded: ${decision.resolution_summary}`.slice(0, 1600);
          await supabaseAdmin.from("messages").insert({
            thread_id: threadId,
            photographer_id: photographerId,
            direction: "out",
            sender: "ai-assistant",
            body: line,
          });
          await supabaseAdmin
            .from("threads")
            .update({ last_outbound_at: new Date().toISOString() })
            .eq("id", threadId);
          return await sendWhatsAppMessage(operatorFromNumber, line);
        });

        return {
          status: "escalation_resolved",
          photographer_id: photographerId,
          escalation_id: pending.id,
          learning_outcome: learningOutcome,
          writeback,
          twilio_sid: ack,
        };
      }
    }

    if (!pending) {
      const awaitingTask = await step.run("fetch-awaiting-reply-task", async () =>
        findEarliestOpenAwaitingReplyTask(supabaseAdmin, photographerId),
      );

      if (awaitingTask) {
        const disposition = await step.run("classify-awaiting-reply-disposition", () =>
          classifyAwaitingReplyDisposition({
            taskTitle: awaitingTask.title,
            photographerReply: rawMessage,
          }),
        );

        if (disposition !== "unresolved") {
          await step.run("apply-awaiting-reply-disposition", async () => {
            await applyAwaitingReplyDisposition(supabaseAdmin, {
              taskId: awaitingTask.id,
              photographerId,
              disposition,
            });
          });

          const ackLine =
            disposition === "answered"
              ? "Recorded your answer; follow-up task closed."
              : `Follow-up still open; due date moved forward ${DEFERRAL_DUE_POLICY_DAYS} days (studio policy).`;

          const ack = await step.run("reply-awaiting-reply-ack", async () => {
            await supabaseAdmin.from("messages").insert({
              thread_id: threadId,
              photographer_id: photographerId,
              direction: "out",
              sender: "ai-assistant",
              body: ackLine,
            });
            await supabaseAdmin
              .from("threads")
              .update({ last_outbound_at: new Date().toISOString() })
              .eq("id", threadId);
            return await sendWhatsAppMessage(operatorFromNumber, ackLine);
          });

          return {
            status: "awaiting_reply_handled",
            photographer_id: photographerId,
            task_id: awaitingTask.id,
            disposition,
            twilio_sid: ack,
          };
        }
      }
    }

    const cmd = rawMessage.trim();
    if (cmd.toLowerCase() === "/help" || cmd.toLowerCase() === "help") {
      const helpText =
        "Commands: /pending — open asks. I can look up weddings, clients, tasks, drafts. I will ask you before discounts, gifts, or delivery changes.";
      await step.run("reply-help", async () => {
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          photographer_id: photographerId,
          direction: "out",
          sender: "ai-assistant",
          body: helpText,
        });
        await supabaseAdmin
          .from("threads")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", threadId);
        return await sendWhatsAppMessage(operatorFromNumber, helpText);
      });
      return { status: "command_help", photographer_id: photographerId };
    }

    if (cmd.toLowerCase() === "/pending") {
      const text = await step.run("format-pending-escalations", async () => {
        const { data: rows } = await supabaseAdmin
          .from("escalation_requests")
          .select("id, action_key, question_body, created_at")
          .eq("photographer_id", photographerId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(5);

        if (!rows?.length) return "No open escalations.";
        return rows
          .map(
            (r) =>
              `• ${(r.action_key as string).slice(0, 40)}: ${(r.question_body as string).slice(0, 120)}`,
          )
          .join("\n")
          .slice(0, 1500);
      });

      await step.run("reply-pending", async () => {
        await supabaseAdmin.from("messages").insert({
          thread_id: threadId,
          photographer_id: photographerId,
          direction: "out",
          sender: "ai-assistant",
          body: text,
        });
        await supabaseAdmin
          .from("threads")
          .update({ last_outbound_at: new Date().toISOString() })
          .eq("id", threadId);
        return await sendWhatsAppMessage(operatorFromNumber, text);
      });
      return { status: "command_pending", photographer_id: photographerId };
    }

    const history = await step.run("fetch-recent-messages", async () => {
      const { data: recentMessages } = await supabaseAdmin
        .from("messages")
        .select("direction, sender, body, sent_at")
        .eq("thread_id", threadId)
        .order("sent_at", { ascending: false })
        .limit(MEMORY_DEPTH);

      if (!recentMessages?.length) return [] as { role: "user" | "assistant"; content: string }[];

      return recentMessages.reverse().map((m) => ({
        role: (m.direction === "out" && m.sender === "ai-assistant" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: (m.body as string) ?? "",
      }));
    });

    const escalationRecordedRef = { value: false };
    const toolCtx = { photographerId, operatorThreadId: threadId, escalationRecordedRef };

    const response = await step.run("operator-orchestrator-think", async () => {
      const last = history[history.length - 1];
      const turns =
        history.length > 0 && last?.role === "user" && last.content === rawMessage
          ? history
          : [...history, { role: "user" as const, content: rawMessage }];

      const messages: OaiMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...turns.map((m) => ({ role: m.role, content: m.content }) as OaiMessage),
      ];

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callOpenAI(messages);

        if (!reply.tool_calls?.length) {
          return (reply.content ?? "").trim();
        }

        messages.push({
          role: "assistant",
          content: reply.content,
          tool_calls: reply.tool_calls,
        });

        for (const tc of reply.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await handleOperatorDataToolCall(tc.function.name, args, toolCtx);

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      }

      const final = await callOpenAI(messages);
      return (final.content ?? "Could not complete that.").trim();
    });

    if (!response) {
      return { status: "empty_response", photographer_id: photographerId };
    }

    const sid = await step.run("log-and-send-whatsapp", async () => {
      await supabaseAdmin.from("messages").insert({
        thread_id: threadId,
        photographer_id: photographerId,
        direction: "out",
        sender: "ai-assistant",
        body: response,
      });
      await supabaseAdmin
        .from("threads")
        .update({ last_outbound_at: new Date().toISOString() })
        .eq("id", threadId);
      if (escalationRecordedRef.value) {
        return null;
      }
      return await sendWhatsAppMessage(operatorFromNumber, response);
    });

    return {
      status: "replied",
      photographer_id: photographerId,
      response_preview: response.slice(0, 120),
      twilio_sid: sid ?? undefined,
      escalation_tool_used: escalationRecordedRef.value,
    };
  },
);
