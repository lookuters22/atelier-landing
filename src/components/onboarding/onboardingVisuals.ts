/**
 * Onboarding briefing — Phase 1 design tokens (local to onboarding only).
 * Warm editorial palette: parchment / alabaster fields, layered paper surfaces,
 * muted sage + gold accents (no purple, no cold SaaS gray, no harsh blue focus).
 */

import { cn } from "@/lib/utils";

// --- Motion (Framer Motion) — calm, non-theatrical ----------------------------------------------
export const obMotionShell = {
  duration: 0.28,
  ease: [0.22, 0.68, 0.35, 1] as [number, number, number, number],
} as const;

/** Full stage + panel entrance (Slice 01 — cinematic-to-focused). */
export const obMotionStageEntrance = {
  duration: 0.55,
  ease: [0.22, 0.65, 0.28, 1] as [number, number, number, number],
} as const;

export const obMotionProgressStagger = 0.055;

// --- Field & backdrop --------------------------------------------------------------------------
/**
 * Fallback when no DynamicBackground (e.g. loading). Full-route onboarding uses DB + vignette in shell.
 */
export const obBackdrop =
  "bg-gradient-to-br from-[#ebe4d8] via-[#f3ede4] to-[#dfd4c8] dark:from-stone-950 dark:via-stone-900 dark:to-stone-950";

/** Warm scrim over cinematic background — focuses attention on the briefing panel (not glass). */
export const obStageVignette =
  "bg-gradient-to-b from-[#0f0c0a]/78 via-[#1c1612]/48 to-[#12100e]/82";

/** Premium shell: clear lift from the cinematic field — reads as a lit briefing desk. */
export const obPanel =
  "rounded-2xl border border-[#d4c4b0]/95 bg-[#fcfaf7] shadow-[0_1px_0_0_rgba(60,48,36,0.06),0_32px_80px_-24px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.55)] dark:border-stone-700/85 dark:bg-[#1a1816] dark:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)]";

/** Left navigation rail — layered paper, separated from main. */
export const obRail =
  "border-[#d4c9bb] bg-[#f7f2ea] dark:border-stone-700/80 dark:bg-[#161412]";

/** Small rail heading (“Sections”). */
export const obRailHeading =
  "mb-2 px-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600 dark:text-stone-400";

/** Main column header (right) — editorial band, distinct from rail. */
export const obHeaderBar =
  "border-b border-[#d4c9bb] bg-gradient-to-b from-[#fdfaf6]/98 to-[#f6f0e7]/95 dark:border-stone-700/70 dark:from-stone-900/65 dark:to-stone-900/40";

/** Scrollable step body — slight tint vs rail. */
export const obContentArea =
  "bg-[radial-gradient(circle_at_top,rgba(255,251,245,0.78),rgba(246,241,233,0.42))] dark:bg-transparent";

/** Anchored footer strip. */
export const obShellFooter =
  "border-t border-[#d4c9bb] bg-[#f9f6f0]/90 pt-4 backdrop-blur-[2px] dark:border-stone-700/70 dark:bg-stone-900/30";

// --- Typography --------------------------------------------------------------------------------
export const obShellKicker =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400";

export const obShellTitle =
  "font-serif text-[1.5rem] font-normal leading-tight tracking-tight text-stone-900 dark:text-stone-100 sm:text-[1.6rem]";

export const obShellSubtitle =
  "mt-1.5 max-w-xl text-[13px] leading-relaxed text-stone-600 dark:text-stone-400";

export const obStageEyebrow =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400";

/** Active step headline — serif editorial moment. */
export const obStepTitle =
  "font-serif text-[1.2rem] font-normal tracking-tight text-stone-900 dark:text-stone-100 sm:text-[1.28rem]";

export const obStepIntro = "text-[13px] leading-relaxed text-stone-600 dark:text-stone-400";

export const obSectionLabel =
  "mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400";

export const obSectionLabelSpaced =
  "mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400";

export const obStageFrame =
  "relative overflow-hidden rounded-[28px] border border-[#d4c4b0]/95 bg-[#fcfaf7] shadow-[0_1px_0_0_rgba(60,48,36,0.06),0_32px_80px_-24px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.55)] dark:border-stone-700/85 dark:bg-[#1a1816] dark:shadow-[0_32px_80px_-24px_rgba(0,0,0,0.65)]";

export const obStageGlow =
  "pointer-events-none absolute inset-x-[12%] top-0 h-32 rounded-full bg-[radial-gradient(circle,rgba(214,190,149,0.16),rgba(214,190,149,0)_70%)] dark:bg-[radial-gradient(circle,rgba(187,170,134,0.14),rgba(187,170,134,0)_72%)]";

// --- Phase 2 — step grouping surfaces (inner steps) --------------------------------------------
/** Primary grouped surface inside a step — layered paper, not flat. */
export const obStepSection =
  "rounded-2xl border border-[#c4b8a8]/85 bg-gradient-to-b from-[#fdfcfa] to-[#f8f5ef] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75),0_2px_8px_rgba(55,48,40,0.05)] sm:p-5 dark:border-stone-600 dark:from-stone-900/50 dark:to-stone-900/35";

export const obFieldLabel =
  "text-[12px] font-semibold tracking-tight text-stone-800 dark:text-stone-200";

export const obFieldHint =
  "text-[11px] leading-relaxed text-stone-600 dark:text-stone-400";

// --- Identity microflow (Slice 02) -------------------------------------------------------------
/** Step index — quiet; must not read as a second window. */
export const obIdentityMicroKicker =
  "text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-stone-500";

/**
 * Prompt layer only — no nested panel: sits directly on shell content (no extra border/shadow card).
 */
export const obIdentityPromptSurface =
  "w-full max-w-[min(44rem,100%)] mx-auto rounded-[28px] border border-[#cfbfaa]/85 bg-[linear-gradient(180deg,rgba(253,251,247,0.98),rgba(247,241,232,0.96))] px-6 py-6 shadow-[0_20px_50px_-28px_rgba(43,35,27,0.28),inset_0_1px_0_rgba(255,255,255,0.88)] backdrop-blur-[6px] sm:px-8 sm:py-7 dark:border-stone-600 dark:bg-[linear-gradient(180deg,rgba(27,24,22,0.96),rgba(22,20,18,0.94))]";

/** @deprecated Use obIdentityPromptSurface — avoid stacked mini-windows */
export const obIdentityActiveCard = obIdentityPromptSurface;

/** Confirmed answers: list typography only, not a bordered stack. */
export const obIdentityConfirmedList = "mb-6 flex flex-wrap gap-2";

export const obIdentityConfirmedRow =
  "group inline-flex min-h-[36px] items-center gap-2 rounded-full border border-[#d9cdbd] bg-[#f5efe6]/90 px-3 py-1.5 text-left transition-colors hover:border-[#b7a48f] hover:bg-[#f1e8dc] dark:border-stone-700 dark:bg-stone-900/55 dark:hover:border-stone-500";

export const obIdentityConfirmedLabel =
  "shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400";

export const obIdentityConfirmedValue =
  "min-w-0 max-w-[12rem] truncate text-[12px] leading-snug text-stone-700 dark:text-stone-300 group-hover:text-stone-900 dark:group-hover:text-stone-100";

export const obIdentityPrompt =
  "font-serif text-[1.7rem] font-normal leading-[1.08] tracking-tight text-stone-900 dark:text-stone-100 sm:text-[2rem]";

export const obIdentityNavMuted =
  "text-[12px] font-medium text-stone-500 hover:text-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:text-stone-400 dark:hover:text-stone-200";

export const obIdentityNavPrimary =
  "inline-flex items-center rounded-full border border-[#b9a890] bg-[#f5eee3] px-3.5 py-1.5 text-[12px] font-semibold text-stone-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-colors hover:bg-[#ede3d4] dark:border-stone-600 dark:bg-stone-800/70 dark:text-stone-100 dark:hover:bg-stone-800";

export const obIdentityStepDots = "flex items-center justify-center gap-2";
export const obIdentityStepDotOn =
  "h-2.5 w-2.5 rounded-full bg-stone-900 shadow-[0_0_0_4px_rgba(185,154,98,0.18)] dark:bg-stone-100";
export const obIdentityStepDotOff = "h-2 w-2 rounded-full bg-stone-300 dark:bg-stone-700";
export const obIdentityTopline =
  "mb-5 flex flex-wrap items-center justify-between gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400";
export const obIdentityFieldDeck = "mt-6";
export const obIdentityQuestionHint =
  "mt-2 max-w-[34rem] text-[13px] leading-relaxed text-stone-600 dark:text-stone-400";

export const obIdentityAnswerStack = "mt-5 flex flex-wrap gap-2";

export const obIdentityAnswerChip =
  "inline-flex min-h-[34px] items-center gap-2 rounded-full border border-[#d7cab8] bg-[#f5efe6]/95 px-3 py-1.5 text-[12px] leading-snug text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-stone-700 dark:bg-stone-900/55 dark:text-stone-300";

export const obIdentityAnswerChipStrong =
  "inline-flex min-h-[34px] items-center gap-2 rounded-full border border-[#8c7a63] bg-[#efe5d7] px-3 py-1.5 text-[12px] font-medium leading-snug text-stone-900 shadow-[0_8px_22px_-16px_rgba(61,48,35,0.45),inset_0_1px_0_rgba(255,255,255,0.85)] dark:border-stone-500 dark:bg-stone-800/80 dark:text-stone-100";

/** Policy row title (scheduling / authority). */
export const obPolicyCardTitle =
  "border-b border-[#e8dfd4] pb-2.5 text-[13px] font-semibold text-stone-900 dark:text-stone-100 dark:border-stone-700/80";

/** Vault card headline — editorial serif. */
export const obVaultCardTitle =
  "border-b border-[#e8dfd4] pb-2.5 font-serif text-[1.08rem] font-normal tracking-tight text-stone-900 dark:border-stone-700/80 dark:text-stone-100";

export const obVoicePreviewMicro =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600 dark:text-stone-400";

/** Quoted preview line — distinct from body chrome. */
export const obVoicePreviewQuote =
  "mt-1.5 rounded-lg border border-[#d4c9bb]/90 bg-[#fdfcfa] px-3 py-2.5 text-[13px] leading-relaxed text-stone-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.6)] dark:border-stone-600 dark:bg-stone-900/55 dark:text-stone-100";

// --- Shared controls (global pass for coherence) -----------------------------------------------
/** Sage-tinted focus — no blue ring. */
export const obInput =
  "w-full rounded-lg border border-[#c4b8a8] bg-[#fdfcfa] px-3 py-2 text-[13px] text-stone-900 shadow-[inset_0_1px_2px_rgba(60,48,36,0.04)] placeholder:text-stone-500/90 focus:border-[#7c8b6f] focus:outline-none focus:ring-2 focus:ring-[#7c8b6f]/25 dark:border-stone-600 dark:bg-stone-900/45 dark:text-stone-100 dark:placeholder:text-stone-500";

export const obTextarea =
  "min-h-[88px] w-full resize-y rounded-lg border border-[#c4b8a8] bg-[#fdfcfa] px-3 py-2 text-[13px] leading-relaxed text-stone-900 shadow-[inset_0_1px_2px_rgba(60,48,36,0.04)] placeholder:text-stone-500/90 focus:border-[#7c8b6f] focus:outline-none focus:ring-2 focus:ring-[#7c8b6f]/25 dark:border-stone-600 dark:bg-stone-900/45 dark:text-stone-100";

/** Cinematic Identity glass field — "What's your studio called?" and matching multiline blocks on the dark briefing. */
export const obIdentityGlassInput =
  "w-full rounded-xl border border-white/20 bg-white/10 px-5 py-4 text-[15px] leading-snug text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-[20px] placeholder:text-white/45 focus:border-white/45 focus:bg-white/[0.14] focus:outline-none focus:ring-2 focus:ring-white/15";

/** Selected — warm charcoal / sage, not loud. */
export const obChipOn =
  "border-[#5c6654] bg-[#dfe6d6] font-medium text-stone-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45)] dark:border-[#8a9a7e] dark:bg-[#3d4538] dark:text-stone-100";

export const obChipOff =
  "border-[#c9bfb2] bg-[#f0ebe3] text-stone-800 hover:border-[#a89886] hover:bg-[#e8e2d8] dark:border-stone-600 dark:bg-stone-900/55 dark:text-stone-300 dark:hover:border-stone-500";

export const obSelectableCardOn =
  "rounded-xl border border-[#5c6654] bg-[#e8ecdf] px-3 py-3 text-left text-[13px] font-medium text-stone-900 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:border-[#8a9a7e] dark:bg-[#3d4538] dark:text-stone-100";

export const obSelectableCardOff =
  "rounded-xl border border-[#c9bfb2] bg-[#f4f0e8] px-3 py-3 text-left text-[13px] text-stone-800 transition-colors hover:border-[#a89886] hover:bg-[#ebe5db] dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-300";

export const obPolicyCard =
  "rounded-xl border border-[#c4b8a8] bg-[#faf8f4] px-3 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),0_1px_2px_rgba(55,48,40,0.04)] sm:px-4 sm:py-4 dark:border-stone-600 dark:bg-stone-900/42";

export const obSecondaryCard =
  "mt-4 rounded-xl border border-[#b5a896]/90 bg-[#ebe4d8]/80 px-3 py-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)] dark:border-stone-600 dark:bg-stone-900/48";

export const obSecondaryTitle =
  "text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-700 dark:text-stone-400";

export const obSecondaryIntro = "mt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400";

export const obAddButton =
  "border-[#a89886] bg-[#f5efe6] text-stone-900 hover:bg-[#ebe4d8] hover:border-[#8f7f6e] dark:border-stone-500 dark:bg-stone-800/65 dark:text-stone-200 dark:hover:bg-stone-800";

// --- Progress rail (vertical desktop; horizontal scroll on small screens) ----------------------
export const obProgressRail =
  "flex w-full items-center gap-2 overflow-x-auto pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const obProgressStepBase =
  "group flex min-w-[96px] shrink-0 items-center gap-2 rounded-full border px-2.5 py-2 text-left transition-[background,border-color,box-shadow,transform] duration-200";

/** Active — editorial marker: sage rail + soft gold inner highlight. */
export const obProgressStepActive = cn(
  obProgressStepBase,
  "border-[#c4b8a8] bg-gradient-to-r from-[#fbf9f4] to-[#f3eee4] shadow-[inset_0_0_0_1px_rgba(184,154,98,0.12),0_1px_3px_rgba(60,48,36,0.06)] ring-1 ring-[#b89a62]/25 dark:border-stone-600 dark:from-stone-900/80 dark:to-stone-900/50 dark:ring-amber-900/20",
);

/** Completed — readable, not ghosted. */
export const obProgressStepDone = cn(
  obProgressStepBase,
  "border-[#d8cec1]/70 bg-[#f5efe6]/70 hover:bg-[#efe9df]/95 dark:border-stone-700/70 dark:bg-stone-900/28 dark:hover:bg-stone-800/45",
);

/** Upcoming — clear labels, muted not invisible. */
export const obProgressStepFuture = cn(
  obProgressStepBase,
  "border-[#ece2d6]/70 bg-[#fcfaf7]/58 hover:bg-[#f3ede6]/78 dark:border-stone-800 dark:bg-stone-900/18 dark:hover:bg-stone-800/34",
);

export const obProgressIndicatorDone =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#7c8b6f]/50 bg-[#dfe6d6] text-[#3d4a36] dark:border-[#6b7c5c] dark:bg-[#2a3228] dark:text-[#c5d4b8]";

export const obProgressIndicatorActive =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[#b89a62]/70 bg-[#fbf6ec] text-[13px] font-semibold text-stone-900 shadow-sm dark:border-amber-700/50 dark:bg-stone-800 dark:text-stone-100";

export const obProgressIndicatorFuture =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#b5a896] bg-[#f7f2ea] text-[12px] font-semibold tabular-nums text-stone-700 dark:border-stone-600 dark:bg-stone-900/60 dark:text-stone-300";

export const obProgressLabel = "block text-[11px] font-medium leading-snug text-stone-900 dark:text-stone-100";

export const obProgressMeta =
  "mt-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400";

export const obProgressStrip =
  "mt-4 flex flex-col gap-3 rounded-2xl border border-[#ded2c2]/85 bg-[#f8f2ea]/86 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] dark:border-stone-700/75 dark:bg-stone-900/36";

export const obProgressCurrentTitle =
  "font-serif text-[1.04rem] font-normal tracking-tight text-stone-900 dark:text-stone-100";

export const obProgressCurrentIntro =
  "text-[12px] leading-relaxed text-stone-600 dark:text-stone-400";

/** @deprecated Legacy horizontal tabs — kept for safety; prefer obProgressRail. */
export const obProgressNav = obProgressRail;

/** @deprecated */
export const obProgressTabActive = obProgressStepActive;

/** @deprecated */
export const obProgressTabDone = obProgressStepDone;

/** @deprecated */
export const obProgressTabFuture = obProgressStepFuture;

// --- Footer ------------------------------------------------------------------------------------
export const obFooterBar = obShellFooter;

export const obFooterBack =
  "border-[#a89886] bg-[#f5efe6] text-stone-900 hover:bg-[#ebe4d8] dark:border-stone-500 dark:bg-stone-800/55 dark:text-stone-100";

export const obFooterBackDisabled =
  "cursor-not-allowed border-[#d4c9bb] bg-[#ebe4d8] text-stone-600 opacity-100 dark:border-stone-700 dark:bg-stone-900/70 dark:text-stone-500";

/** Primary — warm charcoal; focus ring gold-tinted via button focus-visible in component if needed. */
export const obFooterContinue =
  "bg-[#2f2a26] text-[#faf8f5] shadow-sm hover:bg-[#25211e] dark:bg-[#e8e4dc] dark:text-[#1c1916] dark:hover:bg-[#f5f2ec]";

export const obFooterComplete =
  "bg-[linear-gradient(135deg,#2f2a26,#4e4339)] text-[#fbf8f3] shadow-[0_16px_30px_-22px_rgba(40,31,24,0.75)] hover:brightness-[1.04] dark:bg-[linear-gradient(135deg,#efe8de,#d8cbb9)] dark:text-[#171411] dark:hover:brightness-[1.02]";

export const obFooterSave =
  "border-[#c4b8a8] bg-transparent text-stone-800 hover:bg-[#efe9df] hover:text-stone-950 dark:border-stone-600 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100";

// --- Review & misc -----------------------------------------------------------------------------
export const obReviewCard =
  "rounded-2xl border border-[#c4b8a8] bg-gradient-to-b from-[#fdfcfa] to-[#f4efe6] px-5 py-5 shadow-[0_4px_28px_-12px_rgba(45,38,32,0.14),inset_0_1px_0_0_rgba(255,255,255,0.85)] ring-1 ring-[#8b7355]/10 dark:border-stone-600 dark:from-stone-900/55 dark:to-stone-900/40 dark:ring-stone-700/40";

export const obReviewCardTitle =
  "mb-4 border-b border-[#d9cfc3] pb-3 font-serif text-[1.15rem] font-normal tracking-tight text-stone-900 dark:border-stone-600 dark:text-stone-100";

export const obReviewRowBorder =
  "border-b border-[#e0d4c6] last:border-0 dark:border-stone-700/85";

export const obReviewLabel = "text-[12px] font-medium text-stone-700 dark:text-stone-400";

export const obReviewValue = "mt-0.5 text-[13px] leading-snug text-stone-900 dark:text-stone-100";

export const obReviewValueMuted = "mt-0.5 text-[13px] leading-snug text-stone-600 dark:text-stone-400";

export const obReviewNote = "mb-3 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400";

export const obReviewHero =
  "rounded-[26px] border border-[#c9bba9] bg-[linear-gradient(180deg,rgba(252,249,244,0.98),rgba(242,234,223,0.96))] px-5 py-5 shadow-[0_20px_48px_-30px_rgba(55,43,30,0.42),inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-stone-600 dark:bg-[linear-gradient(180deg,rgba(29,26,24,0.96),rgba(23,20,18,0.94))]";

export const obReviewEditLink =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-600 transition-colors hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100";

export const obVoicePreviewCard =
  "rounded-2xl border border-[#c4b8a8] bg-gradient-to-br from-[#f5f0e8] to-[#ebe4d8] px-4 py-4 text-[13px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] dark:border-stone-600 dark:from-stone-900/50 dark:to-stone-900/35";

export const obVaultIntroCard =
  "rounded-2xl border border-[#c4b8a8] bg-gradient-to-b from-[#f7f2ea] to-[#efe9df] px-4 py-4 dark:border-stone-600 dark:from-stone-900/45 dark:to-stone-900/35";

export const obVaultPolicyCard =
  "rounded-2xl border border-[#c4b8a8] bg-[#fdfcfa] px-4 py-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65),0_1px_3px_rgba(55,48,40,0.05)] dark:border-stone-600 dark:bg-stone-900/42";

export const obPlaceholder =
  "mt-6 rounded-xl border border-dashed border-[#a89886] bg-[#f3ede6] px-4 py-8 text-center text-[13px] text-stone-700 dark:border-stone-600 dark:bg-stone-900/35 dark:text-stone-400";

export const obSecondaryRow =
  "flex flex-col gap-2 rounded-lg border border-[#c9bfb2] bg-[#fdfcfa] p-3 sm:flex-row sm:items-end sm:gap-3 dark:border-stone-600 dark:bg-stone-900/38";

/** Single-line optional row (e.g. travel constraint + remove). */
export const obInlineFieldRow =
  "flex flex-row flex-wrap items-center gap-2 rounded-lg border border-[#c9bfb2] bg-[#fdfcfa] p-3 dark:border-stone-600 dark:bg-stone-900/38";

export const obAuthChipOn =
  "min-h-[44px] rounded-full border border-[#5c6654] bg-[#dfe6d6] px-3 py-2 text-center text-[12px] font-medium leading-snug text-stone-900 shadow-sm sm:min-h-0 sm:px-4 dark:border-[#8a9a7e] dark:bg-[#3d4538] dark:text-stone-100";

export const obAuthChipOff =
  "min-h-[44px] rounded-full border border-[#c9bfb2] bg-[#f0ebe3] px-3 py-2 text-center text-[12px] leading-snug text-stone-800 hover:border-[#a89886] hover:bg-[#e8e2d8] sm:min-h-0 sm:px-4 dark:border-stone-600 dark:bg-stone-900/55 dark:text-stone-300";

export const obEscalationOn =
  "border-[#5c6654] bg-[#e4e9dc] font-medium text-stone-900 dark:border-[#8a9a7e] dark:bg-[#3d4538] dark:text-stone-100";

export const obEscalationOff =
  "border-[#c9bfb2] bg-[#f4f0e8] text-stone-800 hover:border-[#a89886] dark:border-stone-600 dark:bg-stone-900/48 dark:text-stone-300";

export const obRadioRowOn =
  "border-[#8f7f6e] bg-[#efe9df] dark:border-stone-500 dark:bg-stone-800/55";

export const obRadioRowOff =
  "border-[#c9bfb2] hover:border-[#a89886] dark:border-stone-600";

export const obSaveError =
  "mb-4 rounded-lg border border-red-300/90 bg-red-50 px-3 py-2 text-[13px] text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200";

export const obSceneStage = "space-y-8";

export const obHeroSection =
  "rounded-[28px] border border-[#c8baa8]/88 bg-[linear-gradient(180deg,rgba(253,250,246,0.98),rgba(244,237,228,0.96))] p-5 shadow-[0_18px_40px_-30px_rgba(55,43,30,0.45),inset_0_1px_0_rgba(255,255,255,0.85)] sm:p-6 dark:border-stone-600 dark:bg-[linear-gradient(180deg,rgba(30,27,25,0.96),rgba(22,20,18,0.94))]";

export const obBubbleCloud =
  "relative overflow-hidden rounded-[28px] border border-[#ccbca8]/88 bg-[radial-gradient(circle_at_top,rgba(255,251,246,0.98),rgba(243,236,226,0.95)_62%,rgba(235,227,215,0.98))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_18px_40px_-30px_rgba(55,43,30,0.35)] sm:p-5 dark:border-stone-600 dark:bg-[radial-gradient(circle_at_top,rgba(36,32,29,0.96),rgba(23,20,18,0.95)_68%)]";

export const obBubbleField =
  "flex min-h-[18rem] flex-wrap items-center gap-3";

export const obScopeCardGrid =
  "grid gap-4 lg:grid-cols-2";

export const obScopeCard =
  "rounded-[24px] border border-[#cabca9]/88 bg-[linear-gradient(180deg,rgba(252,249,244,0.96),rgba(243,235,226,0.94))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] dark:border-stone-600 dark:bg-[linear-gradient(180deg,rgba(30,27,24,0.92),rgba(22,20,18,0.9))]";

export const obDeliverableTokenOn =
  "rounded-2xl border border-[#5c6654] bg-[#e4eadb] px-4 py-3 text-left text-[13px] font-medium text-stone-900 shadow-[0_14px_26px_-24px_rgba(53,67,44,0.55),inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-[#8a9a7e] dark:bg-[#3d4538] dark:text-stone-100";

export const obDeliverableTokenOff =
  "rounded-2xl border border-[#c9bfb2] bg-[#f3ede5] px-4 py-3 text-left text-[13px] text-stone-800 transition-colors hover:border-[#a89886] hover:bg-[#ebe5db] dark:border-stone-600 dark:bg-stone-900/50 dark:text-stone-300";
