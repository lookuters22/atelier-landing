import { describe, expect, it, vi, afterEach } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});
import {
  OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE,
  buildOperatorStudioAssistantAssistantDisplay,
} from "./operatorStudioAssistantWidgetResult.ts";

describe("buildOperatorStudioAssistantAssistantDisplay", () => {
  it("fails closed when clientFacingForbidden is missing", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay({ reply: "secret" }, { devMode: false });
    expect(d.kind).toBe("contract_violation");
    if (d.kind === "contract_violation") {
      expect(d.mainText).toBe(OPERATOR_STUDIO_ASSISTANT_CONTRACT_VIOLATION_MESSAGE);
    }
  });

  it("fails closed when clientFacingForbidden is false", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "secret", clientFacingForbidden: false },
      { devMode: false },
    );
    expect(d.kind).toBe("contract_violation");
  });

  it("returns answer with ribbon when contract holds", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      { reply: "  ok  ", clientFacingForbidden: true },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.mainText).toBe("ok");
      expect(d.operatorRibbon).toContain("Internal assistant");
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("includes devRetrieval in dev when retrievalLog is present", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: ["m1"] },
      },
      { devMode: true },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toEqual({ scopes: ["a"], memoryIds: ["m1"] });
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("hides devRetrieval in production mode even if retrievalLog exists", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        retrievalLog: { scopesQueried: ["a"], selectedMemoryIds: [] },
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.devRetrieval).toBeNull();
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 6: surfaces playbook rule proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add that as a rule candidate.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "playbook_rule_candidate",
            proposedActionKey: "no_flash",
            topic: "On-camera flash",
            proposedInstruction: "Never use on-camera flash during ceremonies.",
            proposedDecisionMode: "forbidden",
            proposedScope: "global",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.playbookRuleProposals).toHaveLength(1);
      expect(d.playbookRuleProposals[0]!.proposedActionKey).toBe("no_flash");
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 7: surfaces task proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I'll add a follow-up task.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "task",
            title: "Call the venue",
            dueDate: "2026-05-01",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.taskProposals).toHaveLength(1);
      expect(d.taskProposals[0]!.title).toBe("Call the venue");
      expect(d.taskProposals[0]!.dueDate).toBe("2026-05-01");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.memoryNoteProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 7+: task proposal without dueDate defaults to today UTC for the confirm card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-20T00:00:00.000Z"));
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "Defaulted due date to today.",
        clientFacingForbidden: true,
        proposedActions: [{ kind: "task", title: "Send contract" }],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.taskProposals).toHaveLength(1);
      expect(d.taskProposals[0]!.dueDate).toBe("2026-02-20");
    }
  });

  it("Slice 8: surfaces memory_note proposals from the edge payload", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can save that as studio memory.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "studio",
            title: "No flash in church",
            summary: "We do not use flash during church ceremonies.",
            fullContent: "We do not use flash during church ceremonies.",
            weddingId: null,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      expect(d.memoryNoteProposals[0]!.memoryScope).toBe("studio");
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.taskProposals).toEqual([]);
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("surfaces person-scoped memory_note with personId", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "ok",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "memory_note",
            memoryScope: "person",
            title: "Prefers natural light",
            summary: "Natural only",
            fullContent: "Asked for very natural portraits",
            personId: "55555555-5555-5555-5555-555555555555",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.memoryNoteProposals).toHaveLength(1);
      const mem = d.memoryNoteProposals[0]!;
      expect(mem.memoryScope).toBe("person");
      expect(mem.personId).toBe("55555555-5555-5555-5555-555555555555");
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 11: surfaces authorized_case_exception proposals (case-scoped only)", () => {
    const wid = "11111111-1111-4111-8111-111111111111";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can add a one-off case exception for this project.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "travel_fee",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: wid,
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.authorizedCaseExceptionProposals).toHaveLength(1);
      expect(d.authorizedCaseExceptionProposals[0]!.overridesActionKey).toBe("travel_fee");
      expect(d.authorizedCaseExceptionProposals[0]!.weddingId).toBe(wid);
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces studio_profile_change_proposal from the edge payload (bounded patches)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a currency change for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "studio_profile_change_proposal",
            rationale: "Operator asked to use EUR for pricing display.",
            settings_patch: { currency: "EUR" },
            studio_business_profile_patch: { service_types: ["wedding", "commercial"] },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.studioProfileChangeProposals).toHaveLength(1);
      const sp = d.studioProfileChangeProposals[0]!;
      expect(sp.rationale).toContain("EUR");
      expect(sp.settings_patch?.currency).toBe("EUR");
      expect(sp.studio_business_profile_patch?.service_types).toEqual(["wedding", "commercial"]);
      expect(d.playbookRuleProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces offer_builder_change_proposal (bounded name / title)", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-000000000001";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a rename for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "offer_builder_change_proposal",
            rationale: "Operator asked to rename the premium offer.",
            project_id: pid,
            metadata_patch: { name: "Editorial Weddings" },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.offerBuilderChangeProposals).toHaveLength(1);
      const ob = d.offerBuilderChangeProposals[0]!;
      expect(ob.project_id).toBe(pid);
      expect(ob.metadata_patch.name).toBe("Editorial Weddings");
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Ana: surfaces invoice_setup_change_proposal (bounded template_patch)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "I can queue a new invoice prefix for review.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "invoice_setup_change_proposal",
            rationale: "Operator asked to change the invoice prefix to INV.",
            template_patch: { invoicePrefix: "INV" },
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.invoiceSetupChangeProposals).toHaveLength(1);
      const inv = d.invoiceSetupChangeProposals[0]!;
      expect(inv.template_patch.invoicePrefix).toBe("INV");
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("F3: surfaces calendar_event_create and reschedule proposals", () => {
    const eid = "aaaaaaaa-bbbb-4ccc-bddd-eeeeeeeeeeee";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "Confirm to add or move the event.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "calendar_event_create",
            title: "Venue call",
            startTime: "2026-05-03T15:00:00.000Z",
            endTime: "2026-05-03T16:00:00.000Z",
            eventType: "other",
            weddingId: null,
          },
          {
            kind: "calendar_event_reschedule",
            calendarEventId: eid,
            startTime: "2026-05-03T16:00:00.000Z",
            endTime: "2026-05-03T17:00:00.000Z",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.calendarEventCreateProposals).toHaveLength(1);
      expect(d.calendarEventCreateProposals[0]!.title).toBe("Venue call");
      expect(d.calendarEventRescheduleProposals).toHaveLength(1);
      expect(d.calendarEventRescheduleProposals[0]!.calendarEventId).toBe(eid);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("Slice 11+: drops authorized_case_exception when weddingId is not a valid UUID (safe-write gate)", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "authorized_case_exception",
            overridesActionKey: "x",
            overridePayload: { decision_mode: "ask_first" },
            weddingId: "not-a-uuid",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.authorizedCaseExceptionProposals).toEqual([]);
      expect(d.studioProfileChangeProposals).toEqual([]);
      expect(d.offerBuilderChangeProposals).toEqual([]);
      expect(d.invoiceSetupChangeProposals).toEqual([]);
      expect(d.calendarEventCreateProposals).toEqual([]);
      expect(d.calendarEventRescheduleProposals).toEqual([]);
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });

  it("S1: surfaces escalation_resolve proposals", () => {
    const eid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "When you agree, confirm to queue resolution.",
        clientFacingForbidden: true,
        proposedActions: [
          {
            kind: "escalation_resolve",
            escalationId: eid,
            resolutionSummary: "Approved exception per studio policy.",
            photographerReplyRaw: "We confirmed on email.",
          },
        ],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.escalationResolveProposals).toHaveLength(1);
      const er = d.escalationResolveProposals[0]!;
      expect(er.escalationId).toBe(eid);
      expect(er.resolutionSummary).toContain("Approved");
      expect(er.photographerReplyRaw).toBe("We confirmed on email.");
    }
  });

  it("S1: drops escalation_resolve with invalid escalation id", () => {
    const d = buildOperatorStudioAssistantAssistantDisplay(
      {
        reply: "x",
        clientFacingForbidden: true,
        proposedActions: [{ kind: "escalation_resolve", escalationId: "bad-id", resolutionSummary: "ok" }],
      },
      { devMode: false },
    );
    expect(d.kind).toBe("answer");
    if (d.kind === "answer") {
      expect(d.escalationResolveProposals).toEqual([]);
    }
  });
});
