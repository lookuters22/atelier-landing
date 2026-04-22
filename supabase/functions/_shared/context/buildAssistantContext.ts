import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type {
  AssistantContext,
  AssistantCrmDigest,
  AssistantFocusedProjectFacts,
  AssistantRetrievalLog,
  AssistantStudioAnalysisSnapshot,
  BuildAssistantContextInput,
} from "../../../../src/types/assistantContext.types.ts";
import { assertResolvedTenantPhotographerId } from "../../../../src/types/decisionContext.types.ts";
import { deriveEffectivePlaybook } from "../policy/deriveEffectivePlaybook.ts";
import { fetchActivePlaybookRulesForDecisionContext } from "./fetchActivePlaybookRulesForDecisionContext.ts";
import { fetchAuthorizedCaseExceptionsForDecisionContext } from "./fetchAuthorizedCaseExceptionsForDecisionContext.ts";
/** Operator Ana: Slice 4 removed digest from the prompt; keep empty shape on context for compatibility. */
const EMPTY_CRM_DIGEST: AssistantCrmDigest = { recentWeddings: [], recentPeople: [] };
import {
  fetchAssistantFocusedProjectFacts,
  fetchAssistantFocusedProjectSummaryRow,
} from "./fetchAssistantFocusedProjectFacts.ts";
import { fetchAssistantOperatorStateSummary } from "./fetchAssistantOperatorStateSummary.ts";
import {
  fetchRelevantGlobalKnowledgeForDecisionContext,
  MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT,
} from "./fetchRelevantGlobalKnowledgeForDecisionContext.ts";
import { fetchAssistantMemoryHeaders } from "../memory/fetchAssistantMemoryHeaders.ts";
import { fetchSelectedMemoriesFull } from "../memory/fetchSelectedMemoriesFull.ts";
import { selectAssistantMemoryIdsDeterministic } from "../memory/selectAssistantMemoryIdsDeterministic.ts";
import { getAssistantAppCatalogForContext } from "../../../../src/lib/operatorAssistantAppCatalog.ts";
import { shouldIncludeAppCatalogInOperatorPrompt } from "../../../../src/lib/operatorAssistantAppHelpIntent.ts";
import { shouldLoadStudioAnalysisSnapshotForQuery } from "../../../../src/lib/operatorAssistantStudioAnalysisIntent.ts";
import { fetchAssistantStudioAnalysisSnapshot } from "./fetchAssistantStudioAnalysisSnapshot.ts";
import { fetchAssistantQueryEntityIndex } from "./fetchAssistantQueryEntityIndex.ts";
import {
  resolveOperatorQueryEntitiesFromIndex,
  shouldRunOperatorQueryEntityResolution,
} from "./resolveOperatorQueryEntitiesFromIndex.ts";
import {
  fetchAssistantThreadMessageBodies,
  IDLE_ASSISTANT_THREAD_MESSAGE_BODIES,
} from "./fetchAssistantThreadMessageBodies.ts";
import {
  fetchAssistantThreadMessageLookup,
  IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP,
} from "./fetchAssistantThreadMessageLookup.ts";
import { hasOperatorQueueStateIntent } from "../../../../src/lib/operatorAssistantOperatorStateIntent.ts";
import {
  hasOperatorThreadMessageBodyLookupIntent,
  hasOperatorThreadMessageLookupIntent,
  querySuggestsCommercialOrNonWeddingInboundFocus,
} from "../../../../src/lib/operatorAssistantThreadMessageLookupIntent.ts";
import {
  hasOperatorInquiryCountContinuityIntent,
  hasOperatorInquiryCountIntent,
} from "../../../../src/lib/operatorAssistantInquiryCountIntent.ts";
import { classifyOperatorAnaTriage } from "../../../../src/lib/operatorAnaTriage.ts";
import { hasOperatorCalendarScheduleIntent } from "../../../../src/lib/operatorAssistantCalendarScheduleIntent.ts";
import { buildOperatorCalendarLookupPlan } from "../../../../src/lib/operatorAssistantCalendarLookupPlan.ts";
import {
  fetchAssistantInquiryCountSnapshot,
  IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT,
} from "./fetchAssistantInquiryCountSnapshot.ts";
import {
  fetchAssistantOperatorCalendarSnapshot,
  IDLE_ASSISTANT_CALENDAR_SNAPSHOT,
} from "./fetchAssistantOperatorCalendarSnapshot.ts";
import { deriveAssistantPlaybookCoverageSummary } from "../../../../src/lib/deriveAssistantPlaybookCoverageSummary.ts";
import {
  prepareCarryForwardForContext,
  tryParseClientCarryForward,
} from "../operatorStudioAssistant/operatorAssistantCarryForward.ts";
import { fetchAssistantStudioBusinessProfile } from "./fetchAssistantStudioBusinessProfile.ts";
import { fetchAssistantStudioOfferBuilderRead } from "./fetchAssistantStudioOfferBuilderRead.ts";
import {
  fetchAssistantStudioInvoiceSetupRead,
  invoiceSetupSpecialistToolPayload,
} from "./fetchAssistantStudioInvoiceSetupRead.ts";
import {
  escalationProvenanceToolPayload,
  fetchAssistantEscalationProvenance,
} from "./fetchAssistantEscalationProvenance.ts";
import {
  fetchAssistantOfferBuilderProjectPin,
  offerBuilderProjectPinToolPayload,
} from "../../../../src/lib/fetchAssistantOfferBuilderProjectPin.ts";
import {
  bulkTriageSpecialistToolPayload,
  investigationSpecialistToolPayload,
} from "../operatorStudioAssistant/tools/operatorAssistantReadOnlyLookupTools.ts";
import { playbookAuditSpecialistToolPayload } from "../operatorStudioAssistant/tools/operatorAssistantPlaybookAuditSpecialist.ts";

function normalizeOptionalUuid(id: string | null | undefined): string | null {
  if (id == null) return null;
  const t = String(id).trim();
  return t.length > 0 ? t : null;
}

/** Short deterministic fingerprint for logs (not for security). */
function queryTextFingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

async function resolveEffectiveFocusWeddingId(
  supabase: SupabaseClient,
  photographerId: string,
  requested: string | null,
): Promise<string | null> {
  if (!requested) return null;
  const { data, error } = await supabase
    .from("weddings")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("id", requested)
    .maybeSingle();
  if (error) {
    throw new Error(`buildAssistantContext: focus wedding verify failed: ${error.message}`);
  }
  return data?.id != null ? String(data.id) : null;
}

async function resolveEffectiveFocusPersonId(
  supabase: SupabaseClient,
  photographerId: string,
  requested: string | null,
): Promise<string | null> {
  if (!requested) return null;
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("photographer_id", photographerId)
    .eq("id", requested)
    .maybeSingle();
  if (error) {
    throw new Error(`buildAssistantContext: focus person verify failed: ${error.message}`);
  }
  return data?.id != null ? String(data.id) : null;
}

/**
 * Photographer-facing assistant retrieval (V3 memory plan Mode B). **Not** for reply-in-thread.
 *
 * - Default memory scope: studio only (plus explicit `focusedWeddingId` / `focusedPersonId` expansion).
 * - Does not use `buildDecisionContext` or reply-mode memory headers.
 * - Output is marked `clientFacingForbidden: true` — do not pass into client-facing writers.
 */
export async function buildAssistantContext(
  supabase: SupabaseClient,
  photographerId: string,
  input: BuildAssistantContextInput,
): Promise<AssistantContext> {
  const tenantPhotographerId = assertResolvedTenantPhotographerId(photographerId);
  const queryText = String(input.queryText ?? "");

  const weddingIdRequested = normalizeOptionalUuid(input.focusedWeddingId ?? null);
  const personIdRequested = normalizeOptionalUuid(input.focusedPersonId ?? null);

  const [weddingIdEffective, personIdEffective] = await Promise.all([
    resolveEffectiveFocusWeddingId(supabase, tenantPhotographerId, weddingIdRequested),
    resolveEffectiveFocusPersonId(supabase, tenantPhotographerId, personIdRequested),
  ]);

  const carryForward = prepareCarryForwardForContext(
    tryParseClientCarryForward(input.carryForward),
    { weddingId: weddingIdEffective, personId: personIdEffective },
    queryText,
    Date.now(),
  );

  const escalationPinRequested = normalizeOptionalUuid(input.escalationResolverEscalationId ?? null);
  const offerBuilderPinRaw = normalizeOptionalUuid(input.offerBuilderSpecialistProjectId ?? null);
  /** S2 — ignored when S1 escalation pin is set (client validated mutual exclusion; defense in depth). */
  const offerBuilderPinRequested = escalationPinRequested ? null : offerBuilderPinRaw;
  /** S3 — invoice specialist; ignored when S1 or S2 pin is set. */
  const invoiceSetupSpecialistRequested =
    input.invoiceSetupSpecialist === true && !escalationPinRequested && !offerBuilderPinRequested;
  const rawInvestigationSpecialist = input.investigationSpecialist === true;
  const rawPlaybookAuditSpecialist = input.playbookAuditSpecialist === true;
  const rawBulkTriageSpecialist = input.bulkTriageSpecialist === true;
  /** S4 — investigation; mutually exclusive with S1–S3, S5, S6. */
  const investigationSpecialistRequested =
    rawInvestigationSpecialist &&
    !escalationPinRequested &&
    !offerBuilderPinRequested &&
    !invoiceSetupSpecialistRequested &&
    !rawPlaybookAuditSpecialist &&
    !rawBulkTriageSpecialist;
  /** S5 — rule audit; mutually exclusive with S1–S4 and S6. */
  const playbookAuditSpecialistRequested =
    rawPlaybookAuditSpecialist &&
    !escalationPinRequested &&
    !offerBuilderPinRequested &&
    !invoiceSetupSpecialistRequested &&
    !rawInvestigationSpecialist &&
    !rawBulkTriageSpecialist;
  /** S6 — bulk queue triage; mutually exclusive with S1–S5. */
  const bulkTriageSpecialistRequested =
    rawBulkTriageSpecialist &&
    !escalationPinRequested &&
    !offerBuilderPinRequested &&
    !invoiceSetupSpecialistRequested &&
    !rawInvestigationSpecialist &&
    !rawPlaybookAuditSpecialist;

  const scopesQueried: AssistantRetrievalLog["scopesQueried"] = [
    "studio_profile",
    "offer_builder",
    "invoice_setup",
    "playbook",
    "studio_memory",
    "knowledge_base",
  ];
  if (weddingIdEffective) {
    scopesQueried.push("project_memory");
    scopesQueried.push("focused_project_summary");
  }
  if (personIdEffective) scopesQueried.push("person_memory");
  scopesQueried.push("operator_state_summary");
  scopesQueried.push("app_catalog");

  const loadStudioAnalysis = shouldLoadStudioAnalysisSnapshotForQuery(queryText);
  if (loadStudioAnalysis) {
    scopesQueried.push("studio_analysis_snapshot");
  }

  const shouldRunEntity = shouldRunOperatorQueryEntityResolution(queryText);
  if (shouldRunEntity) {
    scopesQueried.push("operator_query_entity_resolution");
  }

  const appCatalog = getAssistantAppCatalogForContext();
  const includeAppCatalogInOperatorPrompt = shouldIncludeAppCatalogInOperatorPrompt(queryText);

  const [
    studioProfile,
    studioOfferBuilder,
    studioInvoiceSetup,
    rawPlaybookRules,
    authorizedCaseExceptions,
    memoryHeaders,
    globalKnowledge,
    focusedProjectSummaryAndHints,
    operatorStateSummary,
    studioAnalysisSnapshot,
    entityIndex,
  ] = await Promise.all([
    fetchAssistantStudioBusinessProfile(supabase, tenantPhotographerId),
    fetchAssistantStudioOfferBuilderRead(supabase, tenantPhotographerId),
    fetchAssistantStudioInvoiceSetupRead(supabase, tenantPhotographerId),
    fetchActivePlaybookRulesForDecisionContext(supabase, tenantPhotographerId),
    fetchAuthorizedCaseExceptionsForDecisionContext(
      supabase,
      tenantPhotographerId,
      weddingIdEffective,
      null,
    ),
    fetchAssistantMemoryHeaders(supabase, tenantPhotographerId, weddingIdEffective, personIdEffective),
    fetchRelevantGlobalKnowledgeForDecisionContext(
      supabase,
      {
        photographerId: tenantPhotographerId,
        rawMessage: queryText,
        threadSummary: null,
        replyChannel: "web",
      },
      { maxRows: MAX_GLOBAL_KNOWLEDGE_ROWS_ASSISTANT },
    ),
    weddingIdEffective
      ? fetchAssistantFocusedProjectSummaryRow(supabase, tenantPhotographerId, weddingIdEffective)
      : Promise.resolve(null),
    fetchAssistantOperatorStateSummary(supabase, tenantPhotographerId),
    loadStudioAnalysis
      ? fetchAssistantStudioAnalysisSnapshot(supabase, tenantPhotographerId)
      : Promise.resolve<AssistantStudioAnalysisSnapshot | null>(null),
    shouldRunEntity ? fetchAssistantQueryEntityIndex(supabase, tenantPhotographerId) : Promise.resolve({ weddings: [], people: [] }),
  ]);

  const playbookRules = deriveEffectivePlaybook(rawPlaybookRules, authorizedCaseExceptions);
  const playbookCoverageSummary = deriveAssistantPlaybookCoverageSummary(playbookRules);

  const memoryIds = selectAssistantMemoryIdsDeterministic({
    queryText,
    memoryHeaders,
    focusedWeddingId: weddingIdEffective,
    focusedPersonId: personIdEffective,
    focusedProjectType: focusedProjectSummaryAndHints?.summary?.projectType ?? null,
  });

  const selectedMemories =
    memoryIds.length > 0
      ? await fetchSelectedMemoriesFull(supabase, tenantPhotographerId, memoryIds)
      : [];

  const resCore = resolveOperatorQueryEntitiesFromIndex(queryText, entityIndex.weddings, entityIndex.people);

  let queryResolvedProjectFacts: AssistantFocusedProjectFacts | null = null;
  if (shouldRunEntity && resCore.weddingSignal === "unique" && resCore.uniqueWeddingId) {
    if (weddingIdEffective === resCore.uniqueWeddingId) {
      queryResolvedProjectFacts = null;
    } else {
      queryResolvedProjectFacts = await fetchAssistantFocusedProjectFacts(
        supabase,
        tenantPhotographerId,
        resCore.uniqueWeddingId,
      );
    }
  }
  if (
    queryResolvedProjectFacts != null &&
    hasOperatorThreadMessageLookupIntent(queryText) &&
    querySuggestsCommercialOrNonWeddingInboundFocus(queryText)
  ) {
    queryResolvedProjectFacts = null;
  }

  const operatorQueryEntityResolution = {
    didRun: shouldRunEntity,
    ...resCore,
    queryResolvedProjectFacts,
  };

  const operatorTriage = classifyOperatorAnaTriage({
    queryText,
    weddingIdEffective,
    carryForward,
    entityResolution: {
      weddingSignal: operatorQueryEntityResolution.weddingSignal,
      uniqueWeddingId: operatorQueryEntityResolution.uniqueWeddingId,
    },
  });

  console.log(
    JSON.stringify({
      type: "operator_ana_triage",
      fingerprint: queryTextFingerprint(queryText),
      primary: operatorTriage.primary,
      secondary: operatorTriage.secondary,
      reason: operatorTriage.reason,
    }),
  );

  const loadThreadMessageLookup = hasOperatorThreadMessageLookupIntent(queryText);
  if (loadThreadMessageLookup) {
    scopesQueried.push("operator_thread_message_lookup");
  }

  const loadInquiryCount =
    hasOperatorInquiryCountIntent(queryText) || hasOperatorInquiryCountContinuityIntent(queryText, carryForward);
  if (loadInquiryCount) {
    scopesQueried.push("operator_inquiry_count_snapshot");
  }

  const loadCalendarSnapshot = hasOperatorCalendarScheduleIntent(queryText);
  if (loadCalendarSnapshot) {
    scopesQueried.push("operator_calendar_snapshot");
  }

  const assistantNow = new Date();
  const operatorCalendarLookupPlan =
    loadCalendarSnapshot
      ? buildOperatorCalendarLookupPlan({
          queryText,
          now: assistantNow,
          focusedWeddingId: weddingIdEffective,
          entityResolution: {
            weddingSignal: operatorQueryEntityResolution.weddingSignal,
            uniqueWeddingId: operatorQueryEntityResolution.uniqueWeddingId,
            queryResolvedProjectFacts: operatorQueryEntityResolution.queryResolvedProjectFacts,
          },
          weddingIndexRows: shouldRunEntity ? entityIndex.weddings : [],
        })
      : null;

  const [operatorThreadMessageLookup, operatorInquiryCountSnapshot, operatorCalendarSnapshot] =
    await Promise.all([
      loadThreadMessageLookup
        ? fetchAssistantThreadMessageLookup(supabase, tenantPhotographerId, {
            queryText,
            weddingIdEffective: weddingIdEffective,
            personIdEffective: personIdEffective,
            operatorQueryEntityResolution,
            now: assistantNow,
          })
        : Promise.resolve(IDLE_ASSISTANT_THREAD_MESSAGE_LOOKUP),
      loadInquiryCount
        ? fetchAssistantInquiryCountSnapshot(supabase, tenantPhotographerId, {})
        : Promise.resolve(IDLE_ASSISTANT_INQUIRY_COUNT_SNAPSHOT),
      loadCalendarSnapshot && operatorCalendarLookupPlan
        ? fetchAssistantOperatorCalendarSnapshot(supabase, tenantPhotographerId, {
            now: assistantNow,
            plan: operatorCalendarLookupPlan,
          })
        : Promise.resolve(IDLE_ASSISTANT_CALENDAR_SNAPSHOT),
    ]);

  let operatorThreadMessageBodies = IDLE_ASSISTANT_THREAD_MESSAGE_BODIES;
  if (
    hasOperatorThreadMessageBodyLookupIntent(queryText) &&
    operatorThreadMessageLookup.didRun &&
    operatorThreadMessageLookup.threads.length === 1
  ) {
    operatorThreadMessageBodies = await fetchAssistantThreadMessageBodies(
      supabase,
      tenantPhotographerId,
      operatorThreadMessageLookup.threads[0]!.threadId,
    );
    if (operatorThreadMessageBodies.didRun) {
      scopesQueried.push("operator_thread_message_bodies");
    }
  }

  const retrievalLog: AssistantRetrievalLog = {
    mode: "assistant_query",
    queryDigest: {
      charLength: queryText.length,
      fingerprint: queryTextFingerprint(queryText),
    },
    scopesQueried,
    focus: {
      weddingIdRequested,
      weddingIdEffective,
      personIdRequested,
      personIdEffective,
    },
    queryTextScopeExpansion: "none",
    memoryHeaderCount: memoryHeaders.length,
    selectedMemoryIds: memoryIds,
    globalKnowledgeRowCount: globalKnowledge.length,
    studioAnalysisProjectCount: studioAnalysisSnapshot?.projectCount ?? null,
    entityResolution: {
      didRun: operatorQueryEntityResolution.didRun,
      weddingSignal: operatorQueryEntityResolution.weddingSignal,
      uniqueWeddingId: operatorQueryEntityResolution.uniqueWeddingId,
      weddingCandidateCount: operatorQueryEntityResolution.weddingCandidates.length,
      personMatchCount: operatorQueryEntityResolution.personMatches.length,
      queryResolvedProjectFactsLoaded: operatorQueryEntityResolution.queryResolvedProjectFacts != null,
    },
    threadMessageLookup: {
      didRun: operatorThreadMessageLookup.didRun,
      threadCount: operatorThreadMessageLookup.threads.length,
    },
    threadMessageBodies: {
      didRun: operatorThreadMessageBodies.didRun,
      messageCount: operatorThreadMessageBodies.messages.length,
      truncated: operatorThreadMessageBodies.truncatedOverall,
    },
    inquiryCountSnapshot: {
      didRun: operatorInquiryCountSnapshot.didRun,
      truncated: operatorInquiryCountSnapshot.truncated,
      todayCount: operatorInquiryCountSnapshot.windows.today.count,
      yesterdayCount: operatorInquiryCountSnapshot.windows.yesterday.count,
    },
    calendarSnapshot: {
      didRun: operatorCalendarSnapshot.didRun,
      rowCount: operatorCalendarSnapshot.rowCountReturned,
      truncated: operatorCalendarSnapshot.truncated,
      lookupMode: operatorCalendarSnapshot.lookupMode,
    },
    operatorQueueIntentMatched: hasOperatorQueueStateIntent(queryText),
    playbookCoverage: {
      totalActiveRules: playbookCoverageSummary.totalActiveRules,
      uniqueTopicCount: playbookCoverageSummary.uniqueTopics.length,
      uniqueActionKeyCount: playbookCoverageSummary.uniqueActionKeys.length,
    },
    studioBusinessProfileRowPresent: studioProfile.hasBusinessProfileRow,
    offerBuilder: {
      projectCount: studioOfferBuilder.projects.length,
      listTruncated: studioOfferBuilder.truncated,
    },
    invoiceSetup: {
      hasRow: studioInvoiceSetup.hasRow,
    },
  };

  console.log(
    JSON.stringify({
      type: "assistant_context_retrieval",
      photographerId: tenantPhotographerId,
      ...retrievalLog,
    }),
  );

  const headerOut = memoryHeaders.map((h) => ({
    id: h.id,
    wedding_id: h.wedding_id,
    person_id: h.person_id,
    scope: h.scope,
    type: h.type,
    title: h.title,
    summary: h.summary,
  }));

  let escalationResolverFocus: AssistantContext["escalationResolverFocus"] = null;
  if (escalationPinRequested) {
    scopesQueried.push("escalation_resolver");
    const snap = await fetchAssistantEscalationProvenance(supabase, tenantPhotographerId, escalationPinRequested);
    escalationResolverFocus = {
      pinnedEscalationId: escalationPinRequested,
      toolPayload: escalationProvenanceToolPayload(snap),
    };
  }

  let offerBuilderSpecialistFocus: AssistantContext["offerBuilderSpecialistFocus"] = null;
  if (offerBuilderPinRequested) {
    scopesQueried.push("offer_builder_specialist");
    const pinSnap = await fetchAssistantOfferBuilderProjectPin(
      supabase,
      tenantPhotographerId,
      offerBuilderPinRequested,
    );
    offerBuilderSpecialistFocus = {
      pinnedProjectId: offerBuilderPinRequested,
      toolPayload: offerBuilderProjectPinToolPayload(pinSnap),
    };
  }

  let invoiceSetupSpecialistFocus: AssistantContext["invoiceSetupSpecialistFocus"] = null;
  if (invoiceSetupSpecialistRequested) {
    scopesQueried.push("invoice_setup_specialist");
    invoiceSetupSpecialistFocus = {
      toolPayload: invoiceSetupSpecialistToolPayload(studioInvoiceSetup),
    };
  }

  let investigationSpecialistFocus: AssistantContext["investigationSpecialistFocus"] = null;
  if (investigationSpecialistRequested) {
    scopesQueried.push("investigation_specialist");
    investigationSpecialistFocus = {
      toolPayload: investigationSpecialistToolPayload(),
    };
  }

  let playbookAuditSpecialistFocus: AssistantContext["playbookAuditSpecialistFocus"] = null;
  if (playbookAuditSpecialistRequested) {
    scopesQueried.push("playbook_audit_specialist");
    playbookAuditSpecialistFocus = {
      toolPayload: playbookAuditSpecialistToolPayload(),
    };
  }

  let bulkTriageSpecialistFocus: AssistantContext["bulkTriageSpecialistFocus"] = null;
  if (bulkTriageSpecialistRequested) {
    scopesQueried.push("bulk_triage_specialist");
    bulkTriageSpecialistFocus = {
      toolPayload: bulkTriageSpecialistToolPayload(),
    };
  }

  return {
    clientFacingForbidden: true,
    photographerId: tenantPhotographerId,
    queryText,
    focusedWeddingId: weddingIdEffective,
    focusedPersonId: personIdEffective,
    carryForward,
    playbookCoverageSummary,
    playbookRules,
    rawPlaybookRules,
    authorizedCaseExceptions,
    crmDigest: EMPTY_CRM_DIGEST,
    focusedProjectFacts: null,
    focusedProjectSummary: focusedProjectSummaryAndHints?.summary ?? null,
    focusedProjectRowHints: focusedProjectSummaryAndHints?.rowHints ?? null,
    operatorStateSummary,
    studioProfile,
    studioOfferBuilder,
    studioInvoiceSetup,
    appCatalog,
    includeAppCatalogInOperatorPrompt,
    studioAnalysisSnapshot: studioAnalysisSnapshot,
    operatorQueryEntityResolution,
    operatorThreadMessageLookup,
    operatorThreadMessageBodies,
    operatorInquiryCountSnapshot,
    operatorCalendarSnapshot,
    memoryHeaders: headerOut,
    selectedMemories,
    globalKnowledge,
    retrievalLog,
    operatorTriage,
    escalationResolverFocus,
    offerBuilderSpecialistFocus,
    invoiceSetupSpecialistFocus,
    investigationSpecialistFocus,
    playbookAuditSpecialistFocus,
    bulkTriageSpecialistFocus,
  };
}
