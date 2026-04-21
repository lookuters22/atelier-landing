/** Verbatim copy helpers from `export/redesign/Ana Dashboard.html` Inbox mock — used when live data is absent. */

export const REDESIGN_THREAD_H1_FALLBACK = "Our September wedding in Capri";

export const REDESIGN_CRUMB_INTENT = "Inquiry";
export const REDESIGN_CRUMB_BOOK = "Thorne · Capri · Sep 26";
export const REDESIGN_CRUMB_SENDER_LINE = "Sophia Thorne & 1 other";
export const REDESIGN_CRUMB_MESSAGES = "3 messages";

export const REDESIGN_INSPECTOR_LINKED_H4 = "Thorne · Capri · September 26";
export const REDESIGN_INSPECTOR_LINKED_P =
  "Confirmed date, Signature package — Ana is threading this conversation into the existing project from your Pipeline.";

export const REDESIGN_EVENT_DATE = "Sat, 26 September 2026";
export const REDESIGN_EVENT_LOCATION = "Caesar Augustus, Capri";
export const REDESIGN_EVENT_PACKAGE = "Signature · $28,000";
export const REDESIGN_EVENT_GUESTS = "~60 · small, private";

export const REDESIGN_AI_INTENT = "Booking confirmation";
export const REDESIGN_AI_CONFIDENCE_LABEL = "87%";
export const REDESIGN_AI_REASON =
  "Sophia is picking up from a warm reference (Positano), has a firm date and guest count, and mirrored the Signature package without prompting. Travel & date-hold questions match the standard inquiry flow — safe to confirm pricing and propose the call.";

export const REDESIGN_DRAFT_WHO_FOR = "Sophia & James";
export const REDESIGN_DRAFT_FOOTER_CONF = "87% confidence";
export const REDESIGN_DRAFT_FOOTER_AGO = "drafted 9m ago";
export const REDESIGN_DRAFT_FOOTER_PLAYBOOK = "follows pricing playbook";

/** `Ana Dashboard.html` `.ana-draft-body` paragraphs (demo). */
export const REDESIGN_DRAFT_BODY_PARAGRAPHS = [
  "Sophia, James —",
  "Capri in September is a favourite of mine, and the Caesar Augustus gives us that long, soft light at the western terrace after 17:30 — the kind of hour we built the Positano set around. I'd love to hold the 26th for you.",
  "The Signature package is still $28k for a wedding of your size. Travel from Belgrade is handled on my side (I prefer it that way so I can arrive a day early and scout), and a 30% retainer holds the date — I'll send the simple version of the contract once you're ready.",
  "I have Thursday at 16:00 CET or Friday at 10:00 CET open for the call. Either of those?",
  "Warmly, Elena",
];

/** `Ana Dashboard.html` static Projects rail rows (when no live projects). */
export const REDESIGN_CTX_PROJECTS: { sw: string; label: string }[] = [
  { sw: "#65b5ff", label: "Capri · Thorne Sept 26" },
  { sw: "#ff2067", label: "Ravello · Hartwell Jun" },
  { sw: "#b3e01c", label: "Dolomites · Bennett Nov" },
  { sw: "#dedbd6", label: "Positano · Smith Jul" },
];

/** `Ana Dashboard.html` static Gmail labels rail rows (when no live user labels). */
export const REDESIGN_CTX_GMAIL_LABELS: { sw: string; label: string }[] = [
  { sw: "#f2b8e1", label: "Inquiry" },
  { sw: "#9c9fa5", label: "Vendor" },
  { sw: "#ff5600", label: "VIP" },
];
