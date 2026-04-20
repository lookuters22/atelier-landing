/**
 * Deterministic downgrade for **soft_confirm** inquiry claim drift — narrows brochure-certain phrasing
 * into exploratory / plain operator wording without a full persona rewrite.
 *
 * Re-run {@link runOrchestratorPersonaOutputAudits} after applying. Does not touch pricing, availability,
 * or legal tokens — those are hard_block paths.
 */

export type InquirySoftConfirmRepairResult = {
  text: string;
  /** True when at least one substitution changed the draft. */
  changed: boolean;
};

type Replacement = { re: RegExp; to: string };

/**
 * Longest / most specific patterns first. Global regex; case-insensitive where helpful.
 * Targets the same families as `offeringSoftConfirmViolation` + soft-tier proposal/deliverable triggers.
 */
const INQUIRY_SOFT_CONFIRM_REPLACEMENTS: readonly Replacement[] = [
  {
    re: /\bThat'?s exactly the kind of celebration we love to photograph\b\.?/gi,
    to: "That sounds aligned with what you described, and we'd be happy to hear a bit more about what you have in mind.",
  },
  {
    re: /\bexactly the kind of celebration we love to photograph\b/gi,
    to: "a celebration that sounds aligned with what you described — we'd be glad to hear a bit more when it helps",
  },
  {
    re: /\bexactly the kind of\b[^.!?]{0,100}\b(?:we )?love to photograph\b/gi,
    to: "the kind of day you described — we'd be happy to hear a bit more about what you have in mind",
  },
  {
    re: /\bsounds like exactly the kind\b/gi,
    to: "sounds aligned with the direction you described",
  },
  {
    re: /\bthis is exactly the kind of\b[^.!?]{0,90}\b(we love|work)\b/gi,
    to: "this sounds like the kind of",
  },
  {
    re: /\bexactly the kind of work we love\b/gi,
    to: "the kind of direction you described",
  },
  {
    re: /\bthe kind of\b[^.!?]{0,70}\bwe (?:photograph|shoot|cover)\b/gi,
    to: "what you described — we'd be glad to share a bit more about how we work if helpful",
  },
  {
    re: /\bwe (?:really )?love to (?:photograph|shoot)\b/gi,
    to: "we'd be glad to hear more about what you're planning",
  },
  {
    re: /\bwe(?:'re| are) (?:fully )?comfortable (?:building|incorporating|including)\b/gi,
    to: "we can talk through how that might fit",
  },
  {
    re: /\bbuild (?:this |that )?into (?:coverage|our coverage|the coverage)\b/gi,
    to: "talk through how that could fit",
  },
  {
    re: /\b(?:very much )?within our scope\b/gi,
    to: "something we can talk through based on what you shared",
  },
  {
    re: /\bnatural fit (?:for )?what we (?:do|offer)\b/gi,
    to: "aligned with what you described so far",
  },
  {
    re: /\b(?:the )?sort of celebration we (?:specialize|specialise)\b/gi,
    to: "the sort of celebration you described — we'd be happy to hear a bit more",
  },
  {
    re: /\bthis is (?:very much )?the sort of\b[^.!?]{0,60}\bwe (?:specialize|specialise)\b/gi,
    to: "this sounds like something we'd be glad to learn more about",
  },
  {
    re: /\bkind of (?:celebration|wedding|work) we (?:specialize|specialise)\b/gi,
    to: "kind of celebration you have in mind — we'd be glad to hear more",
  },
  {
    re: /\b(?:beautiful |great |perfect )?fit for the kind of weddings we (?:photograph|shoot|cover)\b/gi,
    to: "aligned with the direction you described — we'd be happy to hear a bit more",
  },
  {
    re: /\b(?:very much )?in line with how we (?:usually|typically|often) work\b/gi,
    to: "in line with what you shared — we can talk through details when helpful",
  },
  {
    re: /\bat the heart of what we do\b/gi,
    to: "central to how we approach our work",
  },
  {
    re: /\bcore to how we work\b/gi,
    to: "important to how we work with couples",
  },
  {
    re: /\bstandard for us\b/gi,
    to: "something we can confirm from the agreement when you're further along",
  },
  {
    re: /\bwe regularly (?:handle|do|photograph|shoot|cover)\b/gi,
    to: "we're happy to talk through",
  },
  {
    re: /\b(?:something |)we always (?:include|offer|provide|deliver)\b/gi,
    to: "something we can walk through if it's helpful",
  },
  {
    re: /\bnot an add-on\b/gi,
    to: "something we can clarify when we talk through scope",
  },
  {
    re: /\bwe\s+absolutely\b/gi,
    to: "we'd be glad to",
  },
  {
    re: /\bwe're absolutely\b|\bwe are absolutely\b/gi,
    to: "we're glad to",
  },
  {
    re: /\bwe always\b[^.!?]{0,80}\b(?:photograph|shoot|cover|include|offer|deliver|structure|shape)\b/gi,
    to: "we can talk through how that might fit",
  },
  /** Proposal process — soft_confirm overstep */
  {
    re: /\b(?:a )?natural part of (?:the )?proposal\b/gi,
    to: "something we can outline in a proposal if helpful",
  },
  {
    re: /\bwould be a natural part\b/gi,
    to: "could be part of what we outline",
  },
  {
    re: /\bwe(?:'d| would) normally structure\b/gi,
    to: "we can talk through how we might structure",
  },
  {
    re: /\bwe usually structure\b[^.!?]{0,50}\bweddings?\b/gi,
    to: "we can walk through how we usually approach weddings like yours",
  },
  {
    re: /\bour proposals are always\b/gi,
    to: "our proposals often",
  },
  {
    re: /\bshape proposals (?:this|that) way\b/gi,
    to: "shape a proposal with you",
  },
  {
    re: /\bnaturally build\b[^.!?]{0,40}\b(?:the )?proposal\b/gi,
    to: "build that into a proposal with you",
  },
  /** Deliverable soft_confirm */
  {
    re: /\bsomething we commonly include\b/gi,
    to: "something we can include depending on scope",
  },
  {
    re: /\bwe always\b[^.!?]{0,60}\b(?:include|deliver|provide)\b/gi,
    to: "we can confirm inclusions when we talk through scope",
  },
];

export function applyDeterministicInquirySoftConfirmRepair(emailDraft: string): InquirySoftConfirmRepairResult {
  let text = emailDraft;
  let changed = false;
  for (const { re, to } of INQUIRY_SOFT_CONFIRM_REPLACEMENTS) {
    const next = text.replace(re, to);
    if (next !== text) {
      changed = true;
      text = next;
    }
  }
  return { text, changed };
}

/**
 * Run up to `maxPasses` times until a fixed point (repair is idempotent for most patterns).
 */
export function applyDeterministicInquirySoftConfirmRepairPasses(
  emailDraft: string,
  maxPasses: number = 2,
): InquirySoftConfirmRepairResult {
  let text = emailDraft;
  let changed = false;
  for (let i = 0; i < maxPasses; i++) {
    const pass = applyDeterministicInquirySoftConfirmRepair(text);
    if (pass.changed) changed = true;
    text = pass.text;
    if (!pass.changed) break;
  }
  return { text, changed };
}
