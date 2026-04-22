import { describe, expect, it } from "vitest";
import {
  IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
  IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
  IDLE_ASSISTANT_STUDIO_PROFILE,
  type AssistantContext,
  type AssistantFocusedProjectFacts,
  type AssistantOperatorStateSummary,
} from "../../../../src/types/assistantContext.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import {
  formatAssistantContextForOperatorLlm,
  formatStudioInvoiceSetupForOperatorLlm,
  formatStudioOfferBuilderForOperatorLlm,
  formatStudioProfileForOperatorLlm,
} from "./formatAssistantContextForOperatorLlm.ts";
import { investigationSpecialistToolPayload } from "./tools/operatorAssistantReadOnlyLookupTools.ts";
import { playbookAuditSpecialistToolPayload } from "./tools/operatorAssistantPlaybookAuditSpecialist.ts";
import { bulkTriageSpecialistToolPayload } from "./tools/operatorAssistantReadOnlyLookupTools.ts";
import {
  IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
} from "../context/fetchAssistantThreadMessageBodies.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../context/fetchAssistantOperatorCalendarSnapshot.ts";
import {
  deriveOperatorQueueHighlights,
  IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
} from "../context/fetchAssistantOperatorStateSummary.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_ANA_TRIAGE } from "../../../../src/lib/operatorAnaTriage.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../context/resolveOperatorQueryEntitiesFromIndex.ts";
import type { EffectivePlaybookRule } from "../../../../src/types/decisionContext.types.ts";

const EMPTY_STATE: AssistantOperatorStateSummary = {
  ...IDLE_ASSISTANT_OPERATOR_STATE_SUMMARY,
  fetchedAt: "2020-01-01T00:00:00.000Z",
  sourcesNote: "",
};

function minimalCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const merged = {
    clientFacingForbidden: true as const,
    photographerId: "p1",
    queryText: "Q?",
    focusedWeddingId: null,
    focusedPersonId: null,
    playbookRules: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    focusedProjectFacts: null,
    focusedProjectSummary: null,
    focusedProjectRowHints: null,
    operatorStateSummary: EMPTY_STATE,
    studioProfile: IDLE_ASSISTANT_STUDIO_PROFILE,
    studioOfferBuilder: IDLE_ASSISTANT_STUDIO_OFFER_BUILDER,
    studioInvoiceSetup: IDLE_ASSISTANT_STUDIO_INVOICE_SETUP,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    appCatalog: getAssistantAppCatalogForContext(),
    studioAnalysisSnapshot: null,
    carryForward: null,
    retrievalLog: {
      mode: "assistant_query" as const,
      queryDigest: { charLength: 2, fingerprint: "ff" },
      scopesQueried: ["studio_memory", "app_catalog"],
      focus: {
        weddingIdRequested: null,
        weddingIdEffective: null,
        personIdRequested: null,
        personIdEffective: null,
      },
      queryTextScopeExpansion: "none",
      memoryHeaderCount: 0,
      selectedMemoryIds: [],
      globalKnowledgeRowCount: 0,
      studioAnalysisProjectCount: null,
    },
    operatorQueryEntityResolution: IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION,
    operatorThreadMessageLookup: IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies: IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    operatorTriage: IDLE_OPERATOR_ANA_TRIAGE,
    escalationResolverFocus: null,
    offerBuilderSpecialistFocus: null,
    invoiceSetupSpecialistFocus: null,
    investigationSpecialistFocus: null,
    playbookAuditSpecialistFocus: null,
    bulkTriageSpecialistFocus: null,
    ...overrides,
  };
  const cov = deriveAssistantPlaybookCoverageSummary(merged.playbookRules);
  return {
    ...merged,
    includeAppCatalogInOperatorPrompt:
      overrides.includeAppCatalogInOperatorPrompt ?? shouldIncludeAppCatalogInOperatorPrompt(merged.queryText),
    operatorThreadMessageLookup:
      merged.operatorThreadMessageLookup ?? IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
    operatorThreadMessageBodies:
      merged.operatorThreadMessageBodies ?? IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
    operatorInquiryCountSnapshot:
      merged.operatorInquiryCountSnapshot ?? IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: merged.operatorCalendarSnapshot ?? IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    playbookCoverageSummary: cov,
    retrievalLog: {
      ...merged.retrievalLog,
      playbookCoverage: {
        totalActiveRules: cov.totalActiveRules,
        uniqueTopicCount: cov.uniqueTopics.length,
        uniqueActionKeyCount: cov.uniqueActionKeys.length,
      },
    },
  };
}

describe("formatAssistantContextForOperatorLlm", () => {
  it("includes empty Offer projects block with honesty about missing rows", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx());
    expect(s).toContain("## Offer projects (grounded");
    expect(s).toMatch(/no offer-builder projects|No rows returned/i);
  });

  it("includes Offer builder specialist (S2) section when offerBuilderSpecialistFocus is set", () => {
    const pid = "a0eebc99-9c0b-4ef8-8bb2-111111111111";
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        offerBuilderSpecialistFocus: {
          pinnedProjectId: pid,
          toolPayload: { didRun: true, selectionNote: "ok", project: { id: pid } },
        },
      }),
    );
    expect(s).toContain("## Offer builder specialist (pinned project)");
    expect(s).toContain(pid);
    expect(s).toContain('"selectionNote":"ok"');
  });

  it("includes Invoice setup specialist (S3) section when invoiceSetupSpecialistFocus is set", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        invoiceSetupSpecialistFocus: {
          toolPayload: { didRun: true, selectionNote: "ok", template: { hasRow: true } },
        },
      }),
    );
    expect(s).toContain("## Invoice setup specialist (pinned template lane)");
    expect(s).toContain('"selectionNote":"ok"');
  });

  it("includes Deep search / investigation mode (S4) section when investigationSpecialistFocus is set", () => {
    const pl = investigationSpecialistToolPayload();
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        investigationSpecialistFocus: { toolPayload: pl },
      }),
    );
    expect(s).toContain("## Deep search / investigation mode (S4)");
    expect(s).toContain('"mode":"deep_search_investigation_v1"');
    expect(s).toContain("maxLookupToolCallsThisTurn");
    expect(s).toContain("evidenceDiscipline");
  });

  it("includes Rule authoring / audit mode (S5) section when playbookAuditSpecialistFocus is set", () => {
    const pl = playbookAuditSpecialistToolPayload();
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        playbookAuditSpecialistFocus: { toolPayload: pl },
      }),
    );
    expect(s).toContain("## Rule authoring / audit mode (S5)");
    expect(s).toContain('"mode":"rule_authoring_audit_v1"');
    expect(s).toContain("proposedActionsPolicy");
  });

  it("includes Bulk queue triage mode (S6) section when bulkTriageSpecialistFocus is set", () => {
    const pl = bulkTriageSpecialistToolPayload();
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        bulkTriageSpecialistFocus: { toolPayload: pl },
      }),
    );
    expect(s).toContain("## Bulk queue triage mode (S6)");
    expect(s).toContain('"mode":"bulk_triage_queue_v1"');
    expect(s).toContain("maxLookupToolCallsThisTurn");
  });

  it("includes Invoice setup block without raw logo data", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx());
    expect(s).toContain("## Invoice setup (grounded");
    expect(s).toMatch(/No row in this read|studio_invoice_setup/i);
    expect(s).not.toMatch(/data:image\//);
  });

  it("renders invoice template fields and logo summary when a row is present", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        studioInvoiceSetup: {
          hasRow: true,
          updatedAt: "2026-05-01T12:00:00.000Z",
          legalName: "Test Studio LLC",
          invoicePrefix: "INV",
          paymentTerms: "Net 30",
          accentColor: "#112233",
          footerNote: "Thanks.",
          footerNoteTruncated: false,
          logo: {
            hasLogo: true,
            mimeType: "image/png",
            approxDataUrlChars: 1200,
            note: "Summary only.",
          },
          note: "N",
        },
      }),
    );
    expect(s).toContain("Test Studio LLC");
    expect(s).toContain("INV");
    expect(s).toContain("Net 30");
    expect(s).toContain("#112233");
    expect(s).toContain("approxDataUrlChars");
    expect(s).not.toContain("data:image/png;base64");
  });

  it("formatStudioInvoiceSetupForOperatorLlm never includes raw data URLs", () => {
    const block = formatStudioInvoiceSetupForOperatorLlm({
      hasRow: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      legalName: "L",
      invoicePrefix: "P",
      paymentTerms: "T",
      accentColor: "#000",
      footerNote: "ok",
      footerNoteTruncated: false,
      logo: {
        hasLogo: true,
        mimeType: "image/png",
        approxDataUrlChars: 50_000,
        note: "Logo stored; bytes not in prompt.",
      },
      note: "ctx",
    });
    expect(block).not.toMatch(/data:image\//);
    expect(block).toContain("50000");
  });

  it("includes offer project rows with ids, updated_at, and derived compactSummary", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        studioOfferBuilder: {
          projects: [
            {
              id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
              displayName: "Premium",
              updatedAt: "2026-04-20T10:00:00.000Z",
              compactSummary: "Document title: “Lux”. Blocks (1): PricingTier×1.",
            },
          ],
          totalListed: 1,
          truncated: false,
          note: "Test note for model.",
        },
      }),
    );
    expect(s).toContain("## Offer projects (grounded");
    expect(s).toContain("Premium");
    expect(s).toContain("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(s).toContain("2026-04-20T10:00:00.000Z");
    expect(s).toContain("compactSummary (derived)");
    expect(s).toContain("Test note for model.");
  });

  it("formatStudioOfferBuilderForOperatorLlm marks factual vs derived", () => {
    const md = formatStudioOfferBuilderForOperatorLlm({
      projects: [
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          displayName: "X",
          updatedAt: "2026-01-01T00:00:00.000Z",
          compactSummary: "Outline only.",
        },
      ],
      totalListed: 1,
      truncated: false,
      note: "N",
    });
    expect(md).toMatch(/Factual \(database\)|derived\)/i);
  });

  it("omits full app catalog JSON for non-app-help queries (deterministic gate)", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx());
    expect(s).not.toContain("## Matched entities / likely project matches");
    expect(s).not.toContain("## Recent thread & email activity");
    expect(s).not.toContain("## Inquiry counts / comparisons");
    expect(s).toContain("## Operator question");
    expect(s).toContain("## Studio profile (capability boundary, not playbook policy)");
    expect(s).toContain("### Identity (`photographers.settings`)");
    expect(s).toContain("### Services & scope (`studio_business_profiles`)");
    expect(s).toContain("## Triage (v1 hint — not a gate)");
    expect(s).toContain('"primary":"unclear"');
    expect(s).toContain('"secondary":[]');
    expect(s).toContain("Q?");
    expect(s).toContain("## App help / navigation");
    expect(s).toContain("Full in-repo app catalog **not** included");
    expect(s).not.toContain("## App help / navigation (in-repo catalog");
    expect(s).not.toContain('"APP_ROUTES"');
    expect(s).toContain('"appCatalogInPrompt":false');
    expect(s).toContain("## Operator state (Today / Inbox — read-only snapshot)");
    expect(s).toContain("**Pending-approval drafts:** 0");
    expect(s).toContain("## Retrieval debug");
    expect(s).toContain('"fingerprint":"ff"');
    expect(s).toContain("appCatalogUtf8Bytes");
    expect(s).not.toContain("## Focused project (summary");
    expect(s).not.toContain("ZZZ_SPOOF_TAB_NOT_IN_CATALOG");
    expect(s).not.toContain("## Weather lookup");
    expect(s).not.toContain("## Studio analysis snapshot");
    expect(s).toContain("## Playbook coverage summary");
    expect(s).toContain("## Playbook (effective rules - authoritative over memory)");
    expect(s).toContain("(no active rules returned)");
    expect(s).toContain('"playbookCoverage"');
    expect(s).not.toContain("## CRM digest (structured - recent projects & people)");
    expect(s).not.toContain("### Recent weddings");
    expect(s).not.toContain("### Recent people");
    expect(s).toContain("## CRM digest (omitted in prompt — Slice 4)");
    expect(s).toMatch(/Slice 4|operator_lookup_project/);
  });

  it("lists playbook coverage summary before the detailed rule lines when rules exist (regression)", () => {
    const r: EffectivePlaybookRule = {
      id: "r1",
      action_key: "wedding_travel",
      topic: "Travel",
      decision_mode: "draft_only",
      scope: "global",
      channel: "email",
      instruction: "Mention travel costs for destination weddings in Hawaii and abroad.",
      source_type: "operator",
      confidence_label: "high",
      is_active: true,
      effectiveDecisionSource: "playbook",
      appliedAuthorizedExceptionId: null,
    };
    const s = formatAssistantContextForOperatorLlm(minimalCtx({ playbookRules: [r] }));
    const covIdx = s.indexOf("## Playbook coverage summary");
    const listIdx = s.indexOf("## Playbook (effective rules - authoritative over memory)");
    expect(covIdx).toBeGreaterThan(-1);
    expect(listIdx).toBeGreaterThan(covIdx);
    expect(s).toContain("**wedding_travel**");
    expect(s).toContain("Mention travel costs");
  });

  it("Slice 12: includes studio analysis snapshot JSON when present", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        studioAnalysisSnapshot: {
          fetchedAt: "2020-01-01T00:00:00.000Z",
          window: { monthsBack: 24, cutoffDateIso: "2018-01-01" },
          projectCount: 2,
          evidenceNotes: ["Rolling window: 24 months — fixture.", "Projects in window: **2**."],
          stageDistribution: { booked: 2 },
          byStage: [{ stage: "booked", count: 2 }],
          projectTypeMix: [{ project_type: "wedding", count: 2 }],
          packageMixBooked: [],
          contractStats: null,
          balanceStats: null,
          openTasksCount: 0,
          openEscalationsCount: 0,
          locationCoverage: { withLocationCount: 0, total: 2, note: "n" },
          rowSamples: [],
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          studioAnalysisProjectCount: 2,
        },
      }),
    );
    const q = s.indexOf("## Operator question");
    const a = s.indexOf("## Studio analysis snapshot (from this studio’s data)");
    const e = s.indexOf("## Effective scope");
    expect(a).toBeGreaterThan(q);
    expect(e).toBeLessThan(a);
    expect(s).toContain("### Grounding (read before JSON)");
    expect(s).toContain("Rolling window: 24 months — fixture.");
    expect(s).toContain('"projectCount":2');
    expect(s).toContain('"studioAnalysisInPrompt":true');
    expect(s).toContain('"studioAnalysisProjectCount":2');
  });

  it("Slice 12 hardening: studio_analysis triage lifts snapshot before operator state", () => {
    const snap = {
      fetchedAt: "2020-01-01T00:00:00.000Z",
      window: { monthsBack: 24, cutoffDateIso: "2018-01-01" },
      projectCount: 2,
      evidenceNotes: ["Test grounding line."],
      stageDistribution: { booked: 2 },
      byStage: [{ stage: "booked", count: 2 }],
      projectTypeMix: [{ project_type: "wedding", count: 2 }],
      packageMixBooked: [],
      contractStats: null,
      balanceStats: null,
      openTasksCount: 0,
      openEscalationsCount: 0,
      locationCoverage: { withLocationCount: 0, total: 2, note: "n" },
      rowSamples: [],
    };
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "What does the data say?",
        operatorTriage: { primary: "studio_analysis", secondary: [], reason: "test" },
        studioAnalysisSnapshot: snap,
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          studioAnalysisProjectCount: 2,
        },
      }),
    );
    const early = s.indexOf("## Studio analysis snapshot (read-only — prioritize for this question)");
    const state = s.indexOf("## Operator state (Today / Inbox — read-only snapshot)");
    expect(early).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(early);
    expect(s).not.toContain("## Studio analysis snapshot (from this studio’s data)");
    expect(s).toContain("Test grounding line.");
  });

  it("Slice 9: includes Open-Meteo weather block when options.weatherToolMarkdown is a non-empty string", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx({ queryText: "Weather in Paris on 2026-05-10?" }), {
      weatherToolMarkdown: "**Source:** Open-Meteo (stub)\n**Date:** 2026-05-10",
    });
    const q = s.indexOf("## Operator question");
    const w = s.indexOf("## Weather lookup (external tool — Open-Meteo)");
    const e = s.indexOf("## Effective scope");
    expect(w).toBeGreaterThan(q);
    expect(e).toBeGreaterThan(w);
    expect(s).toContain("**Source:** Open-Meteo (stub)");
    expect(s).toContain("read from Open-Meteo");
  });

  it("includes full app catalog JSON when query matches app-help intent", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({ queryText: "Where do I find drafts in the app?" }),
    );
    expect(s).toContain("## App help / navigation (in-repo catalog");
    expect(s).toContain('"APP_ROUTES"');
    expect(s).toContain("Ana routing");
    expect(s).toContain('"appCatalogInPrompt":true');
    expect(s).toContain("**Grounding contract:**");
    expect(s).toContain("APP_PROCEDURAL_WORKFLOWS");
  });

  it("when catalog is omitted, tells the model not to invent UI walkthroughs", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx({ queryText: "What’s urgent?" }));
    expect(s).toContain("## App help / navigation");
    expect(s).toMatch(/\*\*not\*\* included/);
    expect(s).toMatch(/do not.*step-by-step|step-by-step UI/i);
    expect(s).toContain('"appCatalogInPrompt":false');
  });

  it("includes read-only calendar block when operatorCalendarSnapshot didRun", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "What is on my calendar Friday?",
        includeAppCatalogInOperatorPrompt: true,
        operatorCalendarSnapshot: {
          didRun: true,
          computedAt: "2026-04-20T10:00:00.000Z",
          lookupMode: "upcoming",
          lookupBasis: "Upcoming rolling window.",
          windowStartIso: "2026-04-20T10:00:00.000Z",
          windowEndIso: "2026-05-20T10:00:00.000Z",
          windowLabel: "30d forward from snapshot time (UTC)",
          windowDays: 30,
          maxRows: 60,
          rowCountReturned: 1,
          truncated: false,
          timeZoneNote: "tz",
          semanticsNote: "read-only",
          weddingFilter: null,
          titleContains: null,
          eventTypeFilter: null,
          orderAscending: true,
          events: [
            {
              id: "ev1",
              title: "Timeline chat",
              startTime: "2026-04-22T12:00:00.000Z",
              endTime: "2026-04-22T12:30:00.000Z",
              eventType: "timeline_call",
              eventTypeLabel: "Timeline call",
              weddingId: "w-1",
              coupleNames: "X & Y",
              meetingLink: null,
            },
          ],
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          calendarSnapshot: { didRun: true, rowCount: 1, truncated: false, lookupMode: "upcoming" },
        },
      }),
    );
    expect(s).toContain("## Calendar lookup (read-only");
    expect(s).toContain("**Evidence contract:**");
    expect(s).toContain("**Lookup mode:** `upcoming`");
    expect(s).toContain("Timeline chat");
    expect(s).toContain("calendarSnapshot");
  });

  it("calendar block shows truncation and project filter metadata when present", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        operatorCalendarSnapshot: {
          didRun: true,
          computedAt: "2026-04-20T10:00:00.000Z",
          lookupMode: "exact_day",
          lookupBasis: "Specific UTC calendar day (2025-06-14).",
          windowStartIso: "2025-06-14T00:00:00.000Z",
          windowEndIso: "2025-06-15T00:00:00.000Z",
          windowLabel: "UTC day 2025-06-14",
          windowDays: 1,
          maxRows: 60,
          rowCountReturned: 60,
          truncated: true,
          timeZoneNote: "tz",
          semanticsNote: "sem",
          weddingFilter: { weddingId: "w-1", coupleNames: "Sofia & Marco" },
          titleContains: null,
          eventTypeFilter: ["about_call"],
          orderAscending: true,
          events: [],
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          calendarSnapshot: {
            didRun: true,
            rowCount: 60,
            truncated: true,
            lookupMode: "exact_day",
          },
        },
      }),
    );
    expect(s).toContain("**Lookup mode:** `exact_day`");
    expect(s).toContain("Sofia & Marco");
    expect(s).toContain("Row cap hit");
    expect(s).toContain("`about_call`");
  });

  it("Slice 5: app catalog JSON in the user message is parseable; excerpt is never empty (anti-drift)", () => {
    const ac = getAssistantAppCatalogForContext();
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({ queryText: "How do I open Settings?", includeAppCatalogInOperatorPrompt: true }),
    );
    const blocks = [...s.matchAll(/```json\n([\s\S]*?)\n```/g)].map((x) => x[1]!.trim());
    const catalogBlock = blocks.find((b) => b.includes('"APP_ROUTES"'));
    expect(catalogBlock).toBeDefined();
    const parsed = JSON.parse(catalogBlock!) as {
      APP_ROUTES: { path: string }[];
      APP_PROCEDURAL_WORKFLOWS: { id: string }[];
    };
    expect(parsed.APP_ROUTES.some((r) => r.path === "/today")).toBe(true);
    expect(Array.isArray(parsed.APP_PROCEDURAL_WORKFLOWS)).toBe(true);
    expect(parsed.APP_PROCEDURAL_WORKFLOWS.some((w) => w.id === "open_settings")).toBe(true);
    expect(ac.markdownExcerpt).toContain("Dock (main nav)");
    expect(ac.serializedUtf8Bytes).toBe(new TextEncoder().encode(ac.catalogJson).length);
  });

  it("renders triage primary and secondary without reason field", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        operatorTriage: {
          primary: "project_crm",
          secondary: ["inbox_threads"],
          reason: "telemetry_only",
        },
      }),
    );
    expect(s).toContain("## Triage (v1 hint — not a gate)");
    expect(s).toContain('{"primary":"project_crm","secondary":["inbox_threads"]}');
    expect(s).not.toContain("telemetry_only");
    expect(s).not.toContain('"reason"');
  });

  it("surfaces state counts and samples for what’s waiting / urgent style questions", () => {
    const base = minimalCtx({ queryText: "What’s urgent?" });
    const counts = {
      ...EMPTY_STATE.counts,
      openEscalations: 2,
      pendingApprovalDrafts: 1,
      zenTabs: { review: 3, drafts: 1, leads: 2, needs_filing: 0 },
    };
    const samples = {
      ...EMPTY_STATE.samples,
      topActions: [
        { id: "open_escalation:x", title: "Policy question", typeLabel: "Escalation" },
      ],
    };
    const s = formatAssistantContextForOperatorLlm({
      ...base,
      retrievalLog: { ...base.retrievalLog, operatorQueueIntentMatched: true },
      operatorStateSummary: {
        ...EMPTY_STATE,
        counts,
        samples,
        queueHighlights: deriveOperatorQueueHighlights(counts, samples),
      },
    });
    expect(s).toContain("## Operator queue / Today snapshot");
    expect(s).toContain("### Snapshot-derived priorities");
    expect(s).toMatch(/counts \+ samples|evidence-backed/i);
    expect(s).toContain("**Open escalations:** 2");
    expect(s).toContain("**Zen tabs");
    expect(s).toContain("[Escalation]");
    expect(s).toContain("Policy question");
    expect(s).not.toContain("## Operator state (Today / Inbox — read-only snapshot)");
  });

  it("non-queue questions keep a single Operator state section in the standard position", () => {
    const s = formatAssistantContextForOperatorLlm(minimalCtx({ queryText: "Hello" }));
    expect(s).toContain("## Operator state (Today / Inbox — read-only snapshot)");
    expect(s).not.toContain("## Operator queue / Today snapshot");
    expect(s).toContain("### Snapshot-derived priorities");
  });

  it("queue-style inbox wording does not force thread block ahead of operator state", () => {
    const base = minimalCtx({ queryText: "What's waiting in my inbox?" });
    const s = formatAssistantContextForOperatorLlm({
      ...base,
      retrievalLog: { ...base.retrievalLog, operatorQueueIntentMatched: true },
      operatorThreadMessageLookup: {
        didRun: true,
        selectionNote: "inbox_scored",
        threads: [
          {
            threadId: "t1",
            title: "X",
            weddingId: null,
            channel: "email",
            kind: "client",
            lastActivityAt: "2025-01-01T00:00:00.000Z",
            lastInboundAt: "2025-01-01T00:00:00.000Z",
            lastOutboundAt: null,
          },
        ],
      },
    });
    const queueIdx = s.indexOf("## Operator queue / Today snapshot");
    const threadIdx = s.indexOf("## Recent thread & email activity");
    expect(queueIdx).toBeGreaterThanOrEqual(0);
    expect(threadIdx).toBeGreaterThan(queueIdx);
  });

  it("includes Recent thread & email activity when operatorThreadMessageLookup.didRun", () => {
    const base = minimalCtx({ queryText: "Did they email us?" });
    const s = formatAssistantContextForOperatorLlm({
      ...base,
      retrievalLog: {
        ...base.retrievalLog,
        threadMessageLookup: { didRun: true, threadCount: 1 },
      },
      operatorThreadMessageLookup: {
        didRun: true,
        selectionNote: "wedding_id in (1 id(s))",
        threads: [
          {
            threadId: "t1",
            title: "Hello",
            weddingId: "w-1",
            channel: "email",
            kind: "client",
            lastActivityAt: "2025-01-01T00:00:00.000Z",
            lastInboundAt: "2025-01-01T00:00:00.000Z",
            lastOutboundAt: null,
          },
        ],
      },
    });
    expect(s).toContain("## Recent thread & email activity");
    expect(s).toMatch(/Envelope only/);
    expect(s).toMatch(/not.*message bodies|message bodies.*not/i);
    expect(s).toMatch(/Do not.*summarize.*title alone|title alone/i);
    expect(s).toContain("last inbound");
    expect(s).toContain("last outbound");
    expect(s).toContain("`t1`");
    expect(s).toContain('"threadMessageLookup"');
  });

  it("includes Thread message excerpts when bounded bodies snapshot has messages", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "What did they say in the email?",
        operatorThreadMessageLookup: {
          didRun: true,
          selectionNote: "single",
          threads: [
            {
              threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              title: "Re: Pricing",
              weddingId: null,
              channel: "email",
              kind: "client",
              lastActivityAt: "2025-01-02T00:00:00.000Z",
              lastInboundAt: "2025-01-02T00:00:00.000Z",
              lastOutboundAt: null,
            },
          ],
        },
        operatorThreadMessageBodies: {
          didRun: true,
          selectionNote: "messages_loaded",
          threadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          threadTitle: "Re: Pricing",
          truncatedOverall: false,
          messages: [
            {
              messageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              direction: "in",
              sender: "client@example.com",
              sentAt: "2025-01-02T00:00:00.000Z",
              bodyExcerpt: "We would love to book June 14.",
              bodyClipped: false,
            },
          ],
        },
      }),
    );
    expect(s).toContain("### Thread message excerpts");
    expect(s).toContain("We would love to book June 14.");
    expect(s).toMatch(/Envelope block|bounded message excerpts/i);
  });

  it("places Recent thread block before Matched entities for commercial inbound + inbox_scored", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "skincare brand inquiry today — did they email?",
        operatorQueryEntityResolution: {
          didRun: true,
          weddingSignal: "unique",
          uniqueWeddingId: "w-x",
          weddingCandidates: [],
          personMatches: [],
          queryResolvedProjectFacts: null,
        },
        operatorThreadMessageLookup: {
          didRun: true,
          selectionNote: "inbox_scored_preferred (1 strong / 1 scored; keywords=3; recency=today)",
          threads: [
            {
              threadId: "t-skin",
              title: "Brand shoot inquiry",
              weddingId: null,
              channel: "email",
              kind: "client",
              lastActivityAt: "2026-04-22T14:00:00.000Z",
              lastInboundAt: "2026-04-22T13:00:00.000Z",
              lastOutboundAt: null,
            },
          ],
        },
      }),
    );
    const iThread = s.indexOf("## Recent thread & email activity");
    const iMatched = s.indexOf("## Matched entities / likely project matches");
    expect(iThread).toBeGreaterThan(0);
    expect(iMatched).toBeGreaterThan(0);
    expect(iThread).toBeLessThan(iMatched);
    expect(s).toContain("commercial / non-wedding");
    expect(s).toContain("Interpretation:");
  });

  it("includes Inquiry counts / comparisons when operatorInquiryCountSnapshot.didRun", () => {
    const base = minimalCtx({ queryText: "How many inquiries do we have today vs yesterday?" });
    const s = formatAssistantContextForOperatorLlm({
      ...base,
      retrievalLog: {
        ...base.retrievalLog,
        inquiryCountSnapshot: { didRun: true, truncated: false, todayCount: 1, yesterdayCount: 2 },
      },
      operatorInquiryCountSnapshot: {
        didRun: true,
        computedAt: "2026-01-10T12:00:00.000Z",
        timezoneNote: "UTC",
        semanticsNote: "Test semantics",
        rowCountLoaded: 3,
        truncated: false,
        comparison: { todayMinusYesterday: -1 },
        windows: {
          today: { label: "a", startIso: "b", endIso: "c", count: 1 },
          yesterday: { label: "a", startIso: "b", endIso: "c", count: 2 },
          thisWeek: { label: "a", startIso: "b", endIso: "c", count: 3 },
          lastWeek: { label: "a", startIso: "b", endIso: "c", count: 0 },
        },
      },
    });
    expect(s).toContain("## Inquiry counts / comparisons");
    expect(s).toContain("**Today:** 1");
    expect(s).toContain("**Yesterday:** 2");
    expect(s).toContain("Today vs yesterday");
    expect(s).toContain('"inquiryCountSnapshot"');
  });

  it("includes Matched entities / likely project matches when didRun and there is a wedding or person signal", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "Elena and Marco",
        operatorQueryEntityResolution: {
          didRun: true,
          weddingSignal: "unique",
          uniqueWeddingId: "w-em",
          weddingCandidates: [],
          personMatches: [],
          queryResolvedProjectFacts: null,
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          entityResolution: {
            didRun: true,
            weddingSignal: "unique",
            uniqueWeddingId: "w-em",
            weddingCandidateCount: 0,
            personMatchCount: 0,
            queryResolvedProjectFactsLoaded: false,
          },
        },
      }),
    );
    const scope = s.indexOf("## Effective scope");
    const matched = s.indexOf("## Matched entities / likely project matches");
    const analysis = s.indexOf("## Studio analysis snapshot");
    expect(matched).toBeGreaterThan(scope);
    if (analysis > 0) {
      expect(matched).toBeLessThan(analysis);
    }
    expect(s).toContain("**Wedding / project match signal:** `unique`");
    expect(s).toContain("`w-em`");
  });

  it("inserts focused project summary (four fields only) after state and before playbook; points to operator_lookup_project_details", () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    const s = formatAssistantContextForOperatorLlm({
      ...minimalCtx(),
      focusedWeddingId: wid,
      focusedProjectSummary: {
        projectId: wid,
        projectType: "wedding",
        stage: "booked",
        displayTitle: "A & B",
      },
    });
    const scope = s.indexOf("## Effective scope");
    const appHelp = s.indexOf("## App help / navigation");
    const state = s.indexOf("## Operator state (Today / Inbox — read-only snapshot)");
    const focused = s.indexOf("## Focused project (summary — call operator_lookup_project_details for specifics)");
    const playbook = s.indexOf("## Playbook (effective rules");
    const mem = s.indexOf("## Durable memory");
    expect(appHelp).toBeGreaterThan(scope);
    expect(state).toBeGreaterThan(appHelp);
    expect(focused).toBeGreaterThan(state);
    expect(playbook).toBeGreaterThan(focused);
    expect(mem).toBeGreaterThan(playbook);
    expect(s).toContain("operator_lookup_project_details");
    expect(s).toContain("**displayTitle:** A & B");
    expect(s).toContain("**projectType:** wedding");
    expect(s).toContain(wid);
    expect(s).not.toContain("Coastal");
    expect(s).not.toContain("Venue / location");
    expect(s).not.toContain("**Couple / project name:**");
    expect(s).not.toContain("### Recent weddings");
    expect(s).toContain("## CRM digest (omitted in prompt — Slice 4)");
  });

  it("Slice 4: non-rendering of digest holds even when crmDigest has many rows (no competing recent-list)", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        crmDigest: {
          recentWeddings: [
            {
              id: "ww-digest-1",
              couple_names: "SHOULD_NOT_APPEAR_IN_LIST",
              stage: "booked",
              wedding_date: "2026-06-01",
            },
          ],
          recentPeople: [{ id: "pp-1", display_name: "NEITHER_SHOULD_PERSON", kind: "client" }],
        },
      }),
    );
    expect(s).not.toContain("SHOULD_NOT_APPEAR_IN_LIST");
    expect(s).not.toContain("NEITHER_SHOULD_PERSON");
    expect(s).not.toContain("## CRM digest (structured - recent projects & people)");
    expect(s).not.toContain("### Recent weddings");
    expect(s).toContain("## CRM digest (omitted in prompt — Slice 4)");
  });
});

const BASE_FACTS = (
  project_type: "wedding" | "commercial" | "video" | "other",
  title: string,
): AssistantFocusedProjectFacts => ({
  weddingId: "550e8400-e29b-41d4-a716-446655440000",
  couple_names: title,
  stage: "inquiry",
  project_type,
  wedding_date: "2026-09-01",
  event_start_date: null,
  event_end_date: null,
  location: "Test Location",
  package_name: "Pkg",
  contract_value: 1000,
  balance_due: 200,
  story_notes: null,
  package_inclusions: [],
  people: [
    {
      person_id: "p1",
      role_label: "Contact",
      is_primary_contact: true,
      display_name: "Person One",
      kind: "client",
    },
  ],
  contactPoints: [],
  counts: { openTasks: 0, openEscalations: 0, pendingApprovalDrafts: 0 },
});

describe("formatAssistantContextForOperatorLlm — Slice 5 project type", () => {
  it("query-resolved project facts: projectType first line; commercial uses Event/schedule not Wedding date label", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "brand work",
        operatorQueryEntityResolution: {
          didRun: true,
          weddingSignal: "unique",
          uniqueWeddingId: BASE_FACTS("commercial", "Nocera").weddingId,
          weddingCandidates: [],
          personMatches: [],
          queryResolvedProjectFacts: BASE_FACTS("commercial", "Nocera brand"),
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          entityResolution: {
            didRun: true,
            weddingSignal: "unique",
            uniqueWeddingId: BASE_FACTS("commercial", "Nocera").weddingId,
            weddingCandidateCount: 0,
            personMatchCount: 0,
            queryResolvedProjectFactsLoaded: true,
          },
        },
      }),
    );
    expect(s).toContain("### Query-resolved project facts");
    expect(s).toMatch(/Project type \(Slice 5/);
    expect(s).toContain("commercial (brand / client work)");
    expect(s).toContain("**Event / schedule date:**");
    expect(s).not.toContain("**Wedding date:**");
    expect(s).toContain("**Client / project title:**");
    expect(s).toContain("project roster + people");
  });

  it("wedding type keeps wedding-specific labels and Wedding date", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        operatorQueryEntityResolution: {
          didRun: true,
          weddingSignal: "unique",
          uniqueWeddingId: BASE_FACTS("wedding", "A & B").weddingId,
          weddingCandidates: [],
          personMatches: [],
          queryResolvedProjectFacts: BASE_FACTS("wedding", "A & B"),
        },
        retrievalLog: {
          ...minimalCtx().retrievalLog,
          entityResolution: {
            didRun: true,
            weddingSignal: "unique",
            uniqueWeddingId: BASE_FACTS("wedding", "A & B").weddingId,
            weddingCandidateCount: 0,
            personMatchCount: 0,
            queryResolvedProjectFactsLoaded: true,
          },
        },
      }),
    );
    expect(s).toMatch(/wedding/);
    expect(s).toContain("**Wedding date:**");
    expect(s).toContain("Couple / project name (wedding)");
    expect(s).toContain("wedding_people + people");
  });

  it("video and other types avoid wedding date label and wedding people header", () => {
    for (const pt of ["video", "other"] as const) {
      const s = formatAssistantContextForOperatorLlm(
        minimalCtx({
          operatorQueryEntityResolution: {
            didRun: true,
            weddingSignal: "unique",
            uniqueWeddingId: "550e8400-e29b-41d4-a716-446655440000",
            weddingCandidates: [],
            personMatches: [],
            queryResolvedProjectFacts: BASE_FACTS(pt, pt === "video" ? "Doc shoot" : "Misc"),
          },
          retrievalLog: {
            ...minimalCtx().retrievalLog,
            entityResolution: {
              didRun: true,
              weddingSignal: "unique",
              uniqueWeddingId: "550e8400-e29b-41d4-a716-446655440000",
              weddingCandidateCount: 0,
              personMatchCount: 0,
              queryResolvedProjectFactsLoaded: true,
            },
          },
        }),
      );
      expect(s).not.toContain("**Wedding date:**");
      expect(s).toContain("**Event / schedule date:**");
    }
  });

  it("focused project summary still carries projectType unchanged", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        focusedWeddingId: "550e8400-e29b-41d4-a716-446655440000",
        focusedProjectSummary: {
          projectId: "550e8400-e29b-41d4-a716-446655440000",
          projectType: "commercial",
          stage: "booked",
          displayTitle: "Brand X",
        },
      }),
    );
    expect(s).toMatch(/## Focused project \(summary/);
    expect(s).toContain("**projectType:** commercial");
  });
});

describe("formatAssistantContextForOperatorLlm — Slice 6 carry-forward", () => {
  it("embeds a Carry-forward pointer block when context carries it", () => {
    const s = formatAssistantContextForOperatorLlm(
      minimalCtx({
        queryText: "When is it?",
        carryForward: {
          lastDomain: "projects",
          lastFocusedProjectId: "a0eebc99-9c0b-4ef8-8bb2-111111111111",
          lastFocusedProjectType: "wedding",
          lastMentionedPersonId: null,
          lastThreadId: null,
          lastEntityAmbiguous: false,
          ageSeconds: 4,
          advisoryHint: { likelyFollowUp: true, reason: "short_cue_detected", confidence: "medium" },
        },
      }),
    );
    expect(s).toMatch(/## Carry-forward pointer/);
    expect(s).toContain("lastFocusedProjectId");
    expect(s).toContain("advisoryHint");
    expect(s).toContain("short_cue_detected");
  });
});

describe("formatStudioProfileForOperatorLlm", () => {
  it("missing business profile row still renders identity lines and explicit gap", () => {
    const md = formatStudioProfileForOperatorLlm({
      ...IDLE_ASSISTANT_STUDIO_PROFILE,
      identity: {
        ...IDLE_ASSISTANT_STUDIO_PROFILE.identity,
        studio_name: "Test Studio",
        currency: "GBP",
        timezone: "Europe/London",
      },
    });
    expect(md).toContain("capability boundary, not playbook policy");
    expect(md).toContain("**Studio name:** Test Studio");
    expect(md).toContain("**Currency:** GBP");
    expect(md).toContain("No `studio_business_profiles` row");
  });

  it("renders bounded capability summaries for video / geography questions", () => {
    const md = formatStudioProfileForOperatorLlm({
      hasBusinessProfileRow: true,
      identity: {
        studio_name: "Lumen",
        manager_name: null,
        photographer_names: null,
        timezone: "Europe/Rome",
        currency: "EUR",
        base_location: "Milan (IT)",
        inquiry_first_step_style: "proactive_call",
      },
      capability: {
        service_types: "wedding, video",
        core_services: null,
        deliverable_types: "digital files",
        geographic_scope: '{"primary":"italy"}',
        travel_policy: '{"mode":"selective"}',
        language_support: "en, it",
        team_structure: null,
        client_types: null,
        lead_acceptance_rules: null,
        service_availability: null,
        booking_scope: null,
        extensions_summary: null,
        source_type: "onboarding",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    });
    expect(md).toContain("**Currency:** EUR");
    expect(md).toContain("wedding, video");
    expect(md).toContain("**Geographic scope:**");
    expect(md).toContain("italy");
    expect(md).toContain("**Inquiry first-step style:** proactive_call");
  });
});
