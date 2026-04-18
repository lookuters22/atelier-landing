import { useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { OnboardingPayloadV4 } from "@/lib/onboardingV4Payload.ts";
import {
  CORE_SERVICE_LABELS,
  OFFER_COMPONENT_LABELS,
  OUT_OF_SCOPE_ACTION_LABELS,
  SPECIALIZATION_LABELS,
  TRAVEL_LABELS,
  parseLanguageSupportCodes,
  resolveBusinessScopeDeterministic,
} from "@/lib/onboardingBriefingScopeDefaults.ts";
import { TONE_ARCHETYPES, parseBriefingVoiceFactsFromSeeds } from "@/lib/onboardingBriefingVoiceUi.ts";
import {
  AUTHORITY_BOARD_GROUPS,
  resolveNonSchedulingAuthorityMode,
} from "@/lib/onboardingBriefingAuthorityPlaybook.ts";
import {
  SCHEDULING_AUTHORITY_ROW_LABELS,
  resolveSchedulingActionPermissionMatrix,
} from "@/lib/onboardingBriefingAuthorityScheduling.ts";
import { SCHEDULING_ACTION_MATRIX_KEYS } from "@/lib/onboardingActionPermissionMatrixScheduling.ts";
import {
  ESCALATION_BATCHING_OPTIONS,
  ESCALATION_TOPIC_LABELS,
  resolveEscalationPreferencesForUi,
} from "@/lib/onboardingBriefingAuthorityEscalationUi.ts";
import {
  decisionModeToPlainLabel,
  formatReviewDecision,
  hasExplicitBusinessScopeSnapshot,
  isBlank,
  isIdentitySectionEmpty,
  nonSchedulingAuthorityIsExplicit,
  schedulingMatrixKeyIsExplicit,
} from "@/lib/onboardingBriefingReviewSummary.ts";
import { resolveBusinessScopeExtensions } from "@/lib/onboardingBusinessScopeExtensions.ts";
import {
  parseBriefingVaultFactsFromSeeds,
  type BriefingVaultFactKey,
} from "@/lib/onboardingBriefingVault.ts";
import { scopeSectorGlassPillBase } from "@/components/onboarding/SectorDonutBubbleField.tsx";
import { obMotionShell } from "@/components/onboarding/onboardingVisuals.ts";
import { cn } from "@/lib/utils";
import { useRegisterOnboardingBriefingHeader } from "@/components/onboarding/OnboardingBriefingHeaderContext.tsx";

const REVIEW_CINEMATIC_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const glassPillReadOnly = cn(
  scopeSectorGlassPillBase,
  "inline-flex max-w-full whitespace-normal px-3 py-2 text-[12px] leading-snug text-white/90",
);

const fieldKicker = "text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55";
const bodyMuted = "text-[12px] leading-relaxed text-white/65 sm:text-[13px]";
const bodyValue = "text-[13px] leading-relaxed text-white/88";

const detailsShell =
  "group rounded-xl border border-white/12 bg-white/[0.06] px-4 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[12px] open:border-white/18";

const summaryRow =
  "flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-semibold text-white/90 [&::-webkit-details-marker]:hidden";

const detailsChevron = "inline-block text-[10px] text-white/40 transition-transform duration-200 group-open:rotate-180";

const NOT_SET = "Not set yet";

const VAULT_FACT_ORDER: readonly { key: BriefingVaultFactKey; title: string }[] = [
  { key: "discount_language", title: "Discounts & investment" },
  { key: "payment_exception_language", title: "Payment exceptions" },
  { key: "late_extension_language", title: "Late payment extensions" },
  { key: "raw_files_language", title: "RAW files" },
  { key: "publication_permission_language", title: "Publication & gallery use" },
  { key: "privacy_language", title: "Sensitive data & privacy" },
];

const scrollRegionClass =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-1 pb-6 pt-1 [-webkit-overflow-scrolling:touch] sm:px-2";

export type OnboardingBriefingReviewStepProps = {
  payload: OnboardingPayloadV4;
  onJumpToStep?: (step: "identity" | "scope" | "voice" | "authority" | "vault") => void;
  onBackStep: () => void;
  onInitializeAna: () => void | Promise<void>;
  onSaveAndExit: () => void;
  saving?: boolean;
};

function toneLabelFromFacts(facts: ReturnType<typeof parseBriefingVoiceFactsFromSeeds>): string | null {
  const raw = facts.tone_archetype?.trim();
  if (!raw) return null;
  return TONE_ARCHETYPES.find((t) => t.id === raw)?.label ?? null;
}

function CinematicReviewRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="border-b border-white/10 py-3 last:border-b-0">
      <p className={fieldKicker}>{label}</p>
      <p className={cn("mt-1.5", muted ? bodyMuted : bodyValue)}>{value}</p>
    </div>
  );
}

function EditChip({
  onClick,
  disabled,
}: {
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (!onClick) return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="shrink-0 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-[background,border-color,color] hover:border-white/40 hover:bg-white/14 hover:text-white disabled:opacity-40"
    >
      Edit
    </button>
  );
}

function ReviewSection({
  title,
  onEdit,
  editDisabled,
  children,
}: {
  title: string;
  onEdit?: () => void;
  editDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-white/10 pb-6 pt-1 text-left last:border-b-0 last:pb-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="font-serif text-[1.2rem] font-normal leading-tight tracking-tight text-white sm:text-[1.28rem]">
          {title}
        </h2>
        <EditChip onClick={onEdit} disabled={editDisabled} />
      </div>
      {children}
    </section>
  );
}

function GlassDetails({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className={detailsShell} open={defaultOpen}>
      <summary className={summaryRow}>
        <span>{title}</span>
        <span className={detailsChevron} aria-hidden>
          ▼
        </span>
      </summary>
      <div className="mt-3 border-t border-white/10 pt-3">{children}</div>
    </details>
  );
}

export function OnboardingBriefingReviewStep({
  payload,
  onJumpToStep,
  onBackStep,
  onInitializeAna,
  onSaveAndExit,
  saving,
}: OnboardingBriefingReviewStepProps) {
  useRegisterOnboardingBriefingHeader("Final review");
  const id = payload.settings_identity;
  const scope = useMemo(
    () => resolveBusinessScopeDeterministic(payload.business_scope_deterministic),
    [payload.business_scope_deterministic],
  );
  const hasExplicitScopeSnapshot = useMemo(
    () => hasExplicitBusinessScopeSnapshot(payload.business_scope_deterministic),
    [payload.business_scope_deterministic],
  );
  const langCodes = useMemo(
    () => parseLanguageSupportCodes(payload.studio_scope.language_support),
    [payload.studio_scope.language_support],
  );
  const voiceFacts = useMemo(
    () => parseBriefingVoiceFactsFromSeeds(payload.knowledge_seeds),
    [payload.knowledge_seeds],
  );
  const schedulingMatrix = useMemo(
    () => resolveSchedulingActionPermissionMatrix(payload.scheduling_action_permission_matrix),
    [payload.scheduling_action_permission_matrix],
  );
  const schedulingRaw = payload.scheduling_action_permission_matrix;
  const escalation = useMemo(
    () => resolveEscalationPreferencesForUi(payload.escalation_preferences),
    [payload.escalation_preferences],
  );
  const escalationExplicit = payload.escalation_preferences !== undefined;

  const vaultFacts = useMemo(
    () => parseBriefingVaultFactsFromSeeds(payload.knowledge_seeds),
    [payload.knowledge_seeds],
  );

  const batchingLabel = useMemo(() => {
    return (
      ESCALATION_BATCHING_OPTIONS.find((o) => o.value === escalation.batching_preference)?.label ??
      "Urgent immediately; batch the rest when safe"
    );
  }, [escalation.batching_preference]);

  const voiceHasAnyContent = useMemo(() => {
    return (
      Object.entries(voiceFacts).some(([, v]) => typeof v === "string" && v.trim().length > 0) ||
      Boolean(voiceFacts.tone_archetype?.trim())
    );
  }, [voiceFacts]);

  const voiceToneLabel = useMemo(() => toneLabelFromFacts(voiceFacts), [voiceFacts]);

  const coreServicesHasAny = scope.core_services.length > 0;
  const specializationsHasAny = scope.specializations.length > 0;
  const offerComponentsHasAny = scope.offer_components.length > 0;

  const languagesLine =
    langCodes.length > 0 ? langCodes.map((c) => c.toUpperCase()).join(", ") : null;

  const travelLabel = TRAVEL_LABELS[scope.travel_policy_mode];
  const leadServiceLabel = OUT_OF_SCOPE_ACTION_LABELS[scope.lead_acceptance.when_service_not_offered];
  const leadGeoLabel = OUT_OF_SCOPE_ACTION_LABELS[scope.lead_acceptance.when_geography_not_in_scope];

  const scopeExt = useMemo(
    () => resolveBusinessScopeExtensions(payload.business_scope_extensions),
    [payload.business_scope_extensions],
  );

  const customSpecializations = useMemo(
    () => scopeExt.custom_specializations ?? [],
    [scopeExt],
  );
  const customOfferComponents = useMemo(
    () => scopeExt.custom_offer_components ?? [],
    [scopeExt],
  );

  const additionalSpecializationsReviewLine = useMemo(() => {
    if (!customSpecializations.length) return null;
    return customSpecializations
      .map((s) => {
        const hint =
          s.behaves_like != null
            ? ` (closest to: ${SPECIALIZATION_LABELS[s.behaves_like]})`
            : "";
        return `${s.label}${hint}`;
      })
      .join("; ");
  }, [customSpecializations]);

  const serviceAreasReviewLine = useMemo(() => {
    const areas = scopeExt.service_areas;
    if (!areas?.length) return null;
    return areas.map((a) => a.label).join(", ");
  }, [scopeExt]);

  const baseLocationReviewLine = useMemo(() => {
    const base = payload.settings_identity.base_location;
    if (!base) return null;
    const country = base.country_code ? ` · ${base.country_code}` : "";
    return `${base.label}${country}`;
  }, [payload.settings_identity.base_location]);

  const travelConstraintsReviewLine = useMemo(() => {
    const t = scopeExt.travel_constraints;
    if (!t?.length) return null;
    return t.join("; ");
  }, [scopeExt]);

  const additionalOfferComponentsReviewLine = useMemo(() => {
    if (!customOfferComponents.length) return null;
    return customOfferComponents
      .map((s) => {
        const hint =
          s.behaves_like != null
            ? ` (closest to: ${OFFER_COMPONENT_LABELS[s.behaves_like]})`
            : "";
        return `${s.label}${hint}`;
      })
      .join("; ");
  }, [customOfferComponents]);

  function jump(step: "identity" | "scope" | "voice" | "authority" | "vault") {
    onJumpToStep?.(step);
  }

  const scopeNote = hasExplicitScopeSnapshot ? (
    <p className={cn(bodyMuted, "mb-3")}>
      Saved from your Business scope step. Empty lists mean you have not selected those items yet.
    </p>
  ) : (
    <p className={cn(bodyMuted, "mb-3")}>
      Geography, travel, and out-of-scope lead rules below are form defaults until you save Business scope. Services,
      deliverables, languages, and blocks only reflect what you have entered so far.
    </p>
  );

  const authorityNote = (
    <p className={cn(bodyMuted, "mb-3")}>
      Scheduling and policy rows show a default until you pick a chip on the Authority step for that action.
    </p>
  );

  const escalationNote = !escalationExplicit ? (
    <p className={cn(bodyMuted, "mb-3")}>Defaults apply until you set escalation on the Authority step.</p>
  ) : null;

  return (
    <div className="cinematic-scope mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden px-4 pt-1 text-center sm:px-8 sm:pt-2">
      <motion.div
        className="shrink-0 px-0.5 pb-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: REVIEW_CINEMATIC_EASE }}
      >
        <h1 className="mx-auto max-w-[38rem] text-balance font-serif text-[clamp(1.35rem,3.8vw,2.35rem)] font-normal leading-[1.1] tracking-tight text-white drop-shadow-[0_4px_32px_rgba(0,0,0,0.55)] sm:text-[clamp(1.65rem,4.2vw,2.55rem)]">
          Read this like Ana&apos;s studio dossier.
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-[12px] leading-relaxed text-white/72 sm:text-[13px]">
          One step — scroll the dossier below, then initialize when you are ready. This is the last calm checkpoint before
          the briefing is marked complete and carried into Today.
        </p>
      </motion.div>

      <div className={cn(scrollRegionClass, "max-w-2xl self-center text-left")}>
        <ReviewSection
          title="Who we are"
          onEdit={onJumpToStep ? () => jump("identity") : undefined}
          editDisabled={saving}
        >
          {isIdentitySectionEmpty(id) ? (
            <p className={cn(bodyMuted)}>{NOT_SET}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className={glassPillReadOnly}>
                Studio · {!isBlank(id.studio_name) ? id.studio_name!.trim() : NOT_SET}
              </span>
              <span className={glassPillReadOnly}>
                Manager · {!isBlank(id.manager_name) ? id.manager_name!.trim() : NOT_SET}
              </span>
              <span className={glassPillReadOnly}>
                Photographers · {!isBlank(id.photographer_names) ? id.photographer_names!.trim() : NOT_SET}
              </span>
              <span className={glassPillReadOnly}>
                Timezone · {!isBlank(id.timezone) ? id.timezone!.trim() : NOT_SET}
              </span>
              <span className={glassPillReadOnly}>
                Currency · {!isBlank(id.currency) ? id.currency!.trim() : NOT_SET}
              </span>
              <span className={glassPillReadOnly}>
                Operator · {!isBlank(id.admin_mobile_number) ? id.admin_mobile_number!.trim() : NOT_SET}
              </span>
            </div>
          )}
        </ReviewSection>

        <ReviewSection
          title="What we offer"
          onEdit={onJumpToStep ? () => jump("scope") : undefined}
          editDisabled={saving}
        >
          {scopeNote}
          <div className="flex flex-col gap-3">
            <GlassDetails title="Services, specializations & offer" defaultOpen>
              {coreServicesHasAny ? (
                <div className="mb-3">
                  <p className={fieldKicker}>Core services</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scope.core_services.map((s) => (
                      <span key={s} className={glassPillReadOnly}>
                        {CORE_SERVICE_LABELS[s]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <CinematicReviewRow label="Core services" value={NOT_SET} muted />
              )}
              {specializationsHasAny ? (
                <div className="mb-3">
                  <p className={fieldKicker}>Specializations</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scope.specializations.map((s) => (
                      <span key={s} className={glassPillReadOnly}>
                        {SPECIALIZATION_LABELS[s]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <CinematicReviewRow label="Specializations" value={NOT_SET} muted />
              )}
              {offerComponentsHasAny ? (
                <div className="mb-3">
                  <p className={fieldKicker}>Offer components</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scope.offer_components.map((o) => (
                      <span key={o} className={glassPillReadOnly}>
                        {OFFER_COMPONENT_LABELS[o]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <CinematicReviewRow label="Offer components" value={NOT_SET} muted />
              )}
              <CinematicReviewRow
                label="Language support"
                value={languagesLine ?? NOT_SET}
                muted={!languagesLine}
              />
              {additionalSpecializationsReviewLine ? (
                <CinematicReviewRow
                  label="Additional specializations"
                  value={additionalSpecializationsReviewLine}
                  muted
                />
              ) : null}
              {additionalOfferComponentsReviewLine ? (
                <CinematicReviewRow
                  label="Additional offer components"
                  value={additionalOfferComponentsReviewLine}
                  muted
                />
              ) : null}
            </GlassDetails>
            <GlassDetails title="Service areas & travel">
              <CinematicReviewRow
                label="Based in"
                value={baseLocationReviewLine ?? NOT_SET}
                muted={!baseLocationReviewLine}
              />
              <CinematicReviewRow
                label="Service areas"
                value={
                  serviceAreasReviewLine ??
                  (hasExplicitScopeSnapshot ? "None selected" : NOT_SET)
                }
                muted={!serviceAreasReviewLine && !hasExplicitScopeSnapshot}
              />
              <CinematicReviewRow
                label="Travel policy"
                value={formatReviewDecision(travelLabel, hasExplicitScopeSnapshot)}
                muted={!hasExplicitScopeSnapshot}
              />
              {travelConstraintsReviewLine ? (
                <CinematicReviewRow label="Travel constraints" value={travelConstraintsReviewLine} muted />
              ) : null}
            </GlassDetails>
            <GlassDetails title="Out-of-scope lead rules">
              <CinematicReviewRow
                label="When a lead asks for a service you do not offer"
                value={formatReviewDecision(leadServiceLabel, hasExplicitScopeSnapshot)}
                muted={!hasExplicitScopeSnapshot}
              />
              <CinematicReviewRow
                label="When a lead is outside your service areas"
                value={formatReviewDecision(leadGeoLabel, hasExplicitScopeSnapshot)}
                muted={!hasExplicitScopeSnapshot}
              />
            </GlassDetails>
          </div>
        </ReviewSection>

        <ReviewSection
          title="How Ana speaks"
          onEdit={onJumpToStep ? () => jump("voice") : undefined}
          editDisabled={saving}
        >
          {!voiceHasAnyContent ? (
            <p className={cn(bodyMuted)}>{NOT_SET}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {voiceToneLabel ? (
                <div>
                  <p className={cn(fieldKicker, "mb-2")}>Tone archetype</p>
                  <span className={glassPillReadOnly}>{voiceToneLabel}</span>
                </div>
              ) : null}
              {!isBlank(voiceFacts.banned_phrases) ||
              !isBlank(voiceFacts.signature_closing) ||
              !isBlank(voiceFacts.standard_booking_language) ||
              !isBlank(voiceFacts.standard_scope_language) ? (
                <div className="space-y-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1">
                  {!isBlank(voiceFacts.banned_phrases) ? (
                    <CinematicReviewRow label="Phrases to avoid" value={voiceFacts.banned_phrases!.trim()} />
                  ) : null}
                  {!isBlank(voiceFacts.signature_closing) ? (
                    <CinematicReviewRow label="Signature closing" value={voiceFacts.signature_closing!.trim()} />
                  ) : null}
                  {!isBlank(voiceFacts.standard_booking_language) ? (
                    <CinematicReviewRow label="Standard booking line" value={voiceFacts.standard_booking_language!.trim()} />
                  ) : null}
                  {!isBlank(voiceFacts.standard_scope_language) ? (
                    <CinematicReviewRow label="Standard scope line" value={voiceFacts.standard_scope_language!.trim()} />
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </ReviewSection>

        <ReviewSection
          title="Authority & escalation"
          onEdit={onJumpToStep ? () => jump("authority") : undefined}
          editDisabled={saving}
        >
          {authorityNote}
          <div className="flex flex-col gap-3">
            <GlassDetails title="Scheduling" defaultOpen>
              <div className="space-y-4">
                {SCHEDULING_ACTION_MATRIX_KEYS.map((key) => {
                  const plain = decisionModeToPlainLabel(schedulingMatrix[key]);
                  const explicit = schedulingMatrixKeyIsExplicit(schedulingRaw, key);
                  return (
                    <div key={key}>
                      <p className="text-[12px] font-medium text-white/80">{SCHEDULING_AUTHORITY_ROW_LABELS[key]}</p>
                      <div className="mt-2">
                        <span className={glassPillReadOnly}>{formatReviewDecision(plain, explicit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassDetails>
            {AUTHORITY_BOARD_GROUPS.map((group) => (
              <GlassDetails key={group.id} title={group.title}>
                <div className="space-y-4">
                  {group.rows.map((row) => {
                    const mode = resolveNonSchedulingAuthorityMode(payload.playbook_seeds, row.action_key);
                    const plain = decisionModeToPlainLabel(mode);
                    const explicit = nonSchedulingAuthorityIsExplicit(payload.playbook_seeds, row.action_key);
                    return (
                      <div key={row.action_key}>
                        <p className="text-[12px] font-medium text-white/80">{row.scenarioLabel}</p>
                        <div className="mt-2">
                          <span className={glassPillReadOnly}>{formatReviewDecision(plain, explicit)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </GlassDetails>
            ))}
            {escalationNote}
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <CinematicReviewRow
                label="Immediate notification topics"
                value={
                  escalation.immediate_notification_topics.length > 0
                    ? escalation.immediate_notification_topics.map((k) => ESCALATION_TOPIC_LABELS[k]).join(", ")
                    : escalationExplicit
                      ? "None selected — everything else follows your batching choice"
                      : formatReviewDecision("No topics pinned for immediate push", false)
                }
                muted={!escalationExplicit}
              />
              <CinematicReviewRow
                label="Batching preference"
                value={escalationExplicit ? batchingLabel : formatReviewDecision(batchingLabel, false)}
                muted={!escalationExplicit}
              />
            </div>
          </div>
        </ReviewSection>

        <ReviewSection
          title="Sensitive policy wording"
          onEdit={onJumpToStep ? () => jump("vault") : undefined}
          editDisabled={saving}
        >
          <p className={cn(bodyMuted, "mb-3")}>Reusable language only — authority still governs what Ana may do.</p>
          <div className="flex flex-col gap-2">
            {VAULT_FACT_ORDER.map(({ key, title }) => {
              const raw = vaultFacts[key]?.trim();
              return (
                <div key={key} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                  <p className={fieldKicker}>{title}</p>
                  <p className={cn("mt-2 text-[12px] leading-relaxed", raw ? "text-white/85" : "text-white/45")}>
                    {raw || NOT_SET}
                  </p>
                </div>
              );
            })}
          </div>
        </ReviewSection>
      </div>

      <motion.div
        className="navigation-reveal relative z-50 mx-auto mt-2 flex w-full max-w-lg shrink-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 sm:mt-3 sm:pt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.2, ease: obMotionShell.ease }}
      >
        <button
          type="button"
          className="text-[13px] font-medium text-white/50 transition-colors hover:text-white/85 disabled:opacity-40"
          onClick={onBackStep}
          disabled={saving}
        >
          Previous
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            className="text-[13px] font-medium text-white/45 transition-colors hover:text-white/80 disabled:opacity-40"
            onClick={onSaveAndExit}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save & exit"}
          </button>
          <button
            type="button"
            className="rounded-full border border-white/35 bg-white/10 px-6 py-2.5 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-sm transition-[background,border-color] hover:border-white/50 hover:bg-white/16 disabled:opacity-40"
            onClick={() => void onInitializeAna()}
            disabled={saving}
          >
            Initialize Ana
          </button>
        </div>
      </motion.div>
    </div>
  );
}
