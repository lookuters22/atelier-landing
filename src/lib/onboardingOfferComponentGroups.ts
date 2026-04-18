/**
 * Onboarding Step 3 — Offerings & Deliverables
 *
 * The full offer-component menu is grouped into four UI sections; which
 * sections are visible depends on the operator's Step 1 (core_services)
 * selection:
 *
 *   - Photo-Specific      → visible when `photo`  or `hybrid`           is chosen
 *   - Video-Specific      → visible when `video`  or `hybrid`           is chosen
 *   - Content Creation    → visible when `content_creation`             is chosen
 *   - Cross-Service       → always visible (logistics, admin, archival)
 *
 * Each group is split into "subsections" purely for visual rhythm in the UI;
 * the canonical enum (`OfferComponentType`) stays flat. This file owns the
 * grouping/visibility model so neither the canonical types file nor the UI
 * step has to know about it.
 */
import type {
  CoreServiceType,
  OfferComponentType,
} from "./onboardingBusinessScopeDeterministic.ts";

export type OfferGroupId = "photo" | "video" | "content_creation" | "cross_service";

export type OfferSubsection = {
  /** Stable id, used as React key. */
  id: string;
  /** Section title rendered above the subsection's rows. */
  title: string;
  /** Optional one-line clarifier under the title. */
  hint?: string;
  /** Canonical IDs that live in this subsection, in display order. */
  items: readonly OfferComponentType[];
};

export type OfferGroup = {
  id: OfferGroupId;
  /** Group label rendered as the major heading. */
  label: string;
  /** One-line description for the group. */
  description: string;
  /**
   * Core services that make this group visible. Empty array = always visible.
   * If the operator's `core_services` intersects with this list, the group
   * renders.
   */
  visibleWhenAnyOf: readonly CoreServiceType[];
  /** Ordered subsections inside this group. */
  subsections: readonly OfferSubsection[];
};

export const OFFER_COMPONENT_GROUPS: readonly OfferGroup[] = [
  {
    id: "photo",
    label: "Photo deliverables",
    description: "Everything tied to your photography output.",
    visibleWhenAnyOf: ["photo", "hybrid"],
    subsections: [
      {
        id: "photo_digital",
        title: "Digital delivery",
        items: [
          "digital_online_gallery",
          "digital_usb_box",
          "digital_highres_download",
          "digital_websize_only",
        ],
      },
      {
        id: "photo_physical",
        title: "Physical media",
        items: [
          "album_fine_art",
          "album_parent",
          "print_fine_art",
          "print_framed",
        ],
      },
      {
        id: "photo_analog",
        title: "Analog & specialty",
        items: ["analog_35mm", "analog_medium_format", "analog_polaroid"],
      },
      {
        id: "photo_post",
        title: "Post-production",
        items: ["post_high_end_retouch", "post_ai_culling", "post_24h_sneaks"],
      },
      {
        id: "photo_onsite",
        title: "On-site team",
        items: ["onsite_second_photographer", "onsite_assistant_lighting"],
      },
      {
        id: "photo_rights",
        title: "Rights & usage",
        items: [
          "rights_full_raw_transfer",
          "rights_commercial_license",
          "rights_personal_only",
        ],
      },
    ],
  },
  {
    id: "video",
    label: "Video deliverables",
    description: "Everything tied to your moving-image output.",
    visibleWhenAnyOf: ["video", "hybrid"],
    subsections: [
      {
        id: "video_films",
        title: "Edited films",
        items: ["vfilm_cinematic_highlight", "vfilm_feature", "vfilm_teaser"],
      },
      {
        id: "video_longform",
        title: "Long form",
        items: ["vlong_full_ceremony", "vlong_full_speeches", "vlong_multicam_doc"],
      },
      {
        id: "video_social",
        title: "Social & fast-turnaround",
        items: [
          "vsocial_same_day_edit",
          "vsocial_reels",
          "vsocial_4k_vertical",
        ],
      },
      {
        id: "video_assets",
        title: "Assets & licensing",
        items: [
          "vassets_full_unedited",
          "vassets_licensed_music",
          "vassets_sound_design",
        ],
      },
      {
        id: "video_specialty",
        title: "Specialty capture",
        items: [
          "vspecialty_drone_aerial",
          "vspecialty_fpv_drone",
          "vspecialty_livestream",
        ],
      },
    ],
  },
  {
    id: "content_creation",
    label: "Content creation",
    description: "Mobile-first social content captured and posted fast.",
    visibleWhenAnyOf: ["content_creation"],
    subsections: [
      {
        id: "cc_mobile",
        title: "Mobile-first storytelling",
        items: ["cc_mobile_raw_clips", "cc_mobile_bts", "cc_mobile_day_in_life"],
      },
      {
        id: "cc_speed",
        title: "Speed",
        items: ["cc_speed_instant_turnaround", "cc_speed_live_posting"],
      },
      {
        id: "cc_editing",
        title: "Editing styles",
        items: [
          "cc_edit_trending_audio",
          "cc_edit_tiktok",
          "cc_edit_capcut_templates",
        ],
      },
    ],
  },
  {
    id: "cross_service",
    label: "Cross-service add-ons",
    description: "Logistics, priority handling, and archival — for any package.",
    visibleWhenAnyOf: [], // empty = always visible
    subsections: [
      {
        id: "cross_logistics",
        title: "Logistics",
        items: [
          "addon_travel_included",
          "addon_destination_fee",
          "addon_additional_hours",
          "addon_overnight_stay",
        ],
      },
      {
        id: "cross_admin",
        title: "Admin & priority",
        items: [
          "addon_priority_delivery",
          "addon_rush_fee",
          "addon_nda_private_gallery",
        ],
      },
      {
        id: "cross_legacy",
        title: "Legacy & archival",
        items: ["addon_hard_drive_archival", "addon_10yr_cloud_storage"],
      },
    ],
  },
];

/**
 * Returns the offer groups that should be visible given the operator's
 * Step 1 (core_services) selection. Cross-service is always included.
 */
export function getVisibleOfferGroups(
  coreServices: readonly CoreServiceType[],
): OfferGroup[] {
  const set = new Set(coreServices);
  return OFFER_COMPONENT_GROUPS.filter((g) => {
    if (g.visibleWhenAnyOf.length === 0) return true;
    return g.visibleWhenAnyOf.some((c) => set.has(c));
  });
}

/**
 * Returns the canonical offer-component IDs that belong to *visible* groups
 * for the given core_services. Used by the UI to purge stale selections when
 * the operator changes their core_services in a previous stage.
 */
export function getOfferComponentsAllowedForCoreServices(
  coreServices: readonly CoreServiceType[],
): Set<OfferComponentType> {
  const allowed = new Set<OfferComponentType>();
  for (const g of getVisibleOfferGroups(coreServices)) {
    for (const sub of g.subsections) {
      for (const id of sub.items) allowed.add(id);
    }
  }
  return allowed;
}

/** Lookup: which group a canonical ID lives in (undefined if orphaned). */
const ID_TO_GROUP: Map<OfferComponentType, OfferGroupId> = (() => {
  const m = new Map<OfferComponentType, OfferGroupId>();
  for (const g of OFFER_COMPONENT_GROUPS) {
    for (const sub of g.subsections) {
      for (const id of sub.items) m.set(id, g.id);
    }
  }
  return m;
})();

export function getGroupForOfferComponent(
  id: OfferComponentType,
): OfferGroupId | undefined {
  return ID_TO_GROUP.get(id);
}
