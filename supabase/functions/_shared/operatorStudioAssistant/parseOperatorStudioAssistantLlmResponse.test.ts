import { describe, expect, it, vi, afterEach } from "vitest";
import { parseOperatorStudioAssistantLlmResponse } from "./parseOperatorStudioAssistantLlmResponse.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseOperatorStudioAssistantLlmResponse", () => {
  it("parses JSON with empty proposals", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({ reply: "Hi there", proposedActions: [] }),
    );
    expect(o.reply).toBe("Hi there");
    expect(o.proposedActions).toEqual([]);
  });

  it("drops invalid proposal entries and keeps the reply", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "playbook_rule_candidate", proposedActionKey: "", topic: "t", proposedInstruction: "i", proposedDecisionMode: "auto", proposedScope: "global" },
        ],
      }),
    );
    expect(o.proposedActions).toEqual([]);
  });

  it("falls back to full text as reply when not JSON", () => {
    const o = parseOperatorStudioAssistantLlmResponse("Plain answer only");
    expect(o.reply).toBe("Plain answer only");
    expect(o.proposedActions).toEqual([]);
  });

  it("Slice 7: parses a task proposal and normalizes dueDate", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          { kind: "task", title: "Follow up with planner", dueDate: "2026-06-15T00:00:00.000Z" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("task");
    if (o.proposedActions[0]!.kind === "task") {
      expect(o.proposedActions[0].title).toBe("Follow up with planner");
      expect(o.proposedActions[0].dueDate).toBe("2026-06-15");
    }
  });

  it("Slice 7+: task without dueDate defaults to today UTC in parsed proposal", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Staged for today — confirm below.",
        proposedActions: [{ kind: "task", title: "Ping the florist" }],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "task") {
      expect(o.proposedActions[0].dueDate).toBe("2026-08-01");
    }
  });

  it("Slice 6+7: keeps both a rule and a task in one turn", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "k1",
            topic: "T",
            proposedInstruction: "I",
            proposedDecisionMode: "auto",
            proposedScope: "global",
          },
          { kind: "task", title: "Call couple", dueDate: "2026-01-10" },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(2);
  });

  it("Slice 8: parses a studio memory_note", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "Package default",
            summary: "Signature includes 10 hours.",
            fullContent: "Signature includes 10 hours coverage.",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("memory_note");
  });

  it("Slice 8: parses a project memory_note with weddingId", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "project",
            title: "Venue constraint",
            summary: "Ceremony ends by 4pm.",
            fullContent: "Ceremony must end by 4pm local time.",
            weddingId: "11111111-1111-1111-1111-111111111111",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].memoryScope).toBe("project");
      expect(o.proposedActions[0].weddingId).toBe("11111111-1111-1111-1111-111111111111");
    }
  });

  it("parses a person memory_note with personId", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "person",
            title: "Contact preference",
            summary: "Email only",
            fullContent: "Prefers email over phone",
            personId: "44444444-4444-4444-4444-444444444444",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "memory_note") {
      expect(o.proposedActions[0].memoryScope).toBe("person");
      expect(o.proposedActions[0].personId).toBe("44444444-4444-4444-4444-444444444444");
    }
  });

  it("Slice 11: parses authorized_case_exception with wedding + override", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "ok",
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "22222222-2222-4222-8222-222222222222",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("authorized_case_exception");
  });

  it("Ana: parses studio_profile_change_proposal (bounded queue)", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Queued for your review — confirm to save.",
        proposedActions: [
          {
            kind: "studio_profile_change_proposal",
            rationale: "Add Italy to service area via extensions.",
            studio_business_profile_patch: {
              extensions: { countries: ["IT", "SM"] },
            },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("studio_profile_change_proposal");
    if (o.proposedActions[0]!.kind === "studio_profile_change_proposal") {
      expect(o.proposedActions[0].rationale).toContain("Italy");
      expect(o.proposedActions[0].studio_business_profile_patch?.extensions).toEqual({ countries: ["IT", "SM"] });
    }
  });

  it("Ana: parses offer_builder_change_proposal (confirm-enqueue only)", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "I can queue a new title for that offer document — confirm to save.",
        proposedActions: [
          {
            kind: "offer_builder_change_proposal",
            rationale: "Operator asked to retitle the document.",
            project_id: pid,
            metadata_patch: { root_title: "Destination Collection" },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("offer_builder_change_proposal");
    if (o.proposedActions[0]!.kind === "offer_builder_change_proposal") {
      expect(o.proposedActions[0].project_id).toBe(pid);
      expect(o.proposedActions[0].metadata_patch.root_title).toBe("Destination Collection");
    }
  });

  it("Ana: parses invoice_setup_change_proposal (confirm-enqueue only)", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "I can queue new payment terms — confirm to save.",
        proposedActions: [
          {
            kind: "invoice_setup_change_proposal",
            rationale: "Operator asked for Net 14.",
            template_patch: { paymentTerms: "Net 14 · Bank transfer" },
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("invoice_setup_change_proposal");
    if (o.proposedActions[0]!.kind === "invoice_setup_change_proposal") {
      expect(o.proposedActions[0].template_patch.paymentTerms).toBe("Net 14 · Bank transfer");
    }
  });

  it("F3: parses calendar_event_create", () => {
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Staged — confirm to add to your calendar.",
        proposedActions: [
          {
            kind: "calendar_event_create",
            title: "Venue Call",
            startTime: "2026-05-04T14:00:00.000Z",
            endTime: "2026-05-04T15:00:00.000Z",
            eventType: "other",
            weddingId: null,
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    expect(o.proposedActions[0]!.kind).toBe("calendar_event_create");
  });

  it("F3: parses calendar_event_reschedule", () => {
    const id = "33333333-3333-4333-a333-333333333333";
    const o = parseOperatorStudioAssistantLlmResponse(
      JSON.stringify({
        reply: "Confirm to move the event.",
        proposedActions: [
          {
            kind: "calendar_event_reschedule",
            calendarEventId: id,
            startTime: "2026-05-04T16:00:00.000Z",
            endTime: "2026-05-04T17:00:00.000Z",
          },
        ],
      }),
    );
    expect(o.proposedActions).toHaveLength(1);
    if (o.proposedActions[0]!.kind === "calendar_event_reschedule") {
      expect(o.proposedActions[0].calendarEventId).toBe(id);
    }
  });
});
