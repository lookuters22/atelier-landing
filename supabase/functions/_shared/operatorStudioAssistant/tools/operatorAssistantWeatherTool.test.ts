/**
 * Slice 9 — weather tool path (Open-Meteo) for operator assistant only.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { AssistantContext, AssistantOperatorStateSummary } from "../../../../../src/types/assistantContext.types.ts";
import { getAssistantAppCatalogForContext } from "../../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import {
  buildOperatorAssistantWeatherMarkdown,
  calendarDaysFromTodayToTargetDate,
  isOperatorWeatherIntent,
} from "./operatorAssistantWeatherTool.ts";
import { __resetOperatorAssistantWeatherRateLimitForTests } from "./operatorAssistantWeatherRateLimit.ts";
import { IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP } from "../../context/fetchAssistantThreadMessageLookup.ts";
import { IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT } from "../../context/fetchAssistantInquiryCountSnapshot.ts";
import { IDLE_ASSISTANT_CALENDAR_SNAPSHOT } from "../../context/fetchAssistantOperatorCalendarSnapshot.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import { IDLE_OPERATOR_QUERY_ENTITY_RESOLUTION } from "../../context/resolveOperatorQueryEntitiesFromIndex.ts";

const EMPTY_OP: AssistantOperatorStateSummary = {
  fetchedAt: "2020-01-01T00:00:00.000Z",
  sourcesNote: "",
  counts: {
    pendingApprovalDrafts: 0,
    openTasks: 0,
    openEscalations: 0,
    linkedOpenLeads: 0,
    unlinked: { inquiry: 0, needsFiling: 0, operatorReview: 0, suppressed: 0 },
    zenTabs: { review: 0, drafts: 0, leads: 0, needs_filing: 0 },
  },
  samples: { pendingDrafts: [], openEscalations: [], openTasks: [], topActions: [] },
};

function minimalCtx(overrides: Partial<AssistantContext> = {}): AssistantContext {
  const merged = {
    clientFacingForbidden: true as const,
    photographerId: "p-weather-1",
    queryText: "Hi",
    focusedWeddingId: null,
    focusedPersonId: null,
    playbookRules: [],
    rawPlaybookRules: [],
    authorizedCaseExceptions: [],
    crmDigest: { recentWeddings: [], recentPeople: [] },
    focusedProjectFacts: null,
    focusedProjectSummary: null,
    focusedProjectRowHints: null,
    operatorStateSummary: EMPTY_OP,
    memoryHeaders: [],
    selectedMemories: [],
    globalKnowledge: [],
    appCatalog: getAssistantAppCatalogForContext(),
    studioAnalysisSnapshot: null,
    retrievalLog: {
      mode: "assistant_query" as const,
      queryDigest: { charLength: 2, fingerprint: "wx" },
      scopesQueried: [] as string[],
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
    operatorInquiryCountSnapshot: IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
    operatorCalendarSnapshot: IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
    ...overrides,
  };
  const cov = deriveAssistantPlaybookCoverageSummary(merged.playbookRules);
  return {
    ...merged,
    includeAppCatalogInOperatorPrompt:
      overrides.includeAppCatalogInOperatorPrompt ?? shouldIncludeAppCatalogInOperatorPrompt(merged.queryText),
    operatorThreadMessageLookup:
      merged.operatorThreadMessageLookup ?? IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
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

describe("isOperatorWeatherIntent", () => {
  it("detects common forecast/weather phrasing", () => {
    expect(isOperatorWeatherIntent("What's the weather in Paris?")).toBe(true);
    expect(isOperatorWeatherIntent("Will it rain on 2026-05-20?")).toBe(true);
    expect(isOperatorWeatherIntent("Chance of rain that day?")).toBe(true);
  });

  it("returns false for non-weather assist questions (regression)", () => {
    expect(isOperatorWeatherIntent("Where do I find drafts?")).toBe(false);
    expect(isOperatorWeatherIntent("Add a playbook rule: no flash")).toBe(false);
    expect(isOperatorWeatherIntent("Remind me to send the gallery by Friday")).toBe(false);
  });
});

describe("calendarDaysFromTodayToTargetDate", () => {
  it("computes day offset in UTC from today", () => {
    const now = new Date("2026-05-01T15:00:00.000Z");
    expect(calendarDaysFromTodayToTargetDate("2026-05-10", now)).toBe(9);
    expect(calendarDaysFromTodayToTargetDate("2026-04-20", now)).toBe(-11);
  });
});

describe("buildOperatorAssistantWeatherMarkdown", () => {
  beforeEach(() => {
    __resetOperatorAssistantWeatherRateLimitForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetOperatorAssistantWeatherRateLimitForTests();
  });

  it("returns null when the query is not a weather question", async () => {
    const o = await buildOperatorAssistantWeatherMarkdown(
      minimalCtx({ queryText: "What’s urgent in my queue?" }),
    );
    expect(o).toBeNull();
  });

  it("emits a bounded “not run” message when place/date cannot be resolved", async () => {
    const s = await buildOperatorAssistantWeatherMarkdown(
      minimalCtx({ queryText: "What’s the weather like?" }),
    );
    expect(s).toContain("Weather lookup (not run)");
    expect(s).toContain("Open-Meteo");
  });

  it("uses focused project location + date when the operator references the wedding (no explicit place)", async () => {
    const wid = "11111111-1111-1111-1111-111111111111";
    const shoot = "2026-05-10";
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("geocoding-api.open-meteo.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              results: [{ name: "Coastal Venue", latitude: 40.0, longitude: -74.0, country: "US" }],
            }),
        };
      }
      if (String(url).includes("api.open-meteo.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              daily: {
                time: [shoot],
                weathercode: [0],
                temperature_2m_max: [28],
                temperature_2m_min: [20],
                precipitation_probability_max: [0],
              },
            }),
        };
      }
      throw new Error("unexpected: " + url);
    });
    const s = await buildOperatorAssistantWeatherMarkdown(
      minimalCtx({
        queryText: "What’s the weather forecast for this wedding on the shoot day?",
        focusedWeddingId: wid,
        focusedProjectRowHints: {
          location: "Coastal Venue, NY, USA",
          wedding_date: shoot,
          event_start_date: null,
          event_end_date: null,
        },
      }),
      fetchImpl,
    );
    expect(s).toContain("**Source:**");
    expect(s).toContain("Open-Meteo");
    expect(s).toContain("Coastal");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("does not call the API for dates beyond the free forecast window", async () => {
    const fetchImpl = vi.fn();
    const s = await buildOperatorAssistantWeatherMarkdown(
      minimalCtx({ queryText: "Forecast for 2030-01-01 in Budapest? weather" }),
      fetchImpl,
    );
    expect(s).toContain("Forecast unavailable (window)");
    expect(s).toContain("16");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rate-limits after the configured cap per hour (operator tenant)", async () => {
    const original = process.env.OPERATOR_ASSISTANT_WEATHER_MAX_PER_HOUR;
    process.env.OPERATOR_ASSISTANT_WEATHER_MAX_PER_HOUR = "1";
    __resetOperatorAssistantWeatherRateLimitForTests();
    const fetchImpl = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("geocoding-api.open-meteo.com")) {
        return {
          ok: true,
          json: () => Promise.resolve({ results: [{ name: "P", latitude: 1, longitude: 1 }] }),
        };
      }
      if (String(url).includes("api.open-meteo.com")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              daily: {
                time: ["2026-05-05"],
                weathercode: [0],
                temperature_2m_max: [1],
                temperature_2m_min: [0],
                precipitation_probability_max: [0],
              },
            }),
        };
      }
      throw new Error(url);
    });
    const q = "What’s the weather in Paris on 2026-05-05?";
    const first = await buildOperatorAssistantWeatherMarkdown(minimalCtx({ queryText: q, photographerId: "rl1" }), fetchImpl);
    expect(first).toContain("**Source:**");
    const second = await buildOperatorAssistantWeatherMarkdown(minimalCtx({ queryText: q, photographerId: "rl1" }), fetchImpl);
    expect(second).toContain("Rate limit");
    process.env.OPERATOR_ASSISTANT_WEATHER_MAX_PER_HOUR = original;
  });
});
