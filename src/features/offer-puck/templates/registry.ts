import type { Data } from "@measured/puck";
import { TEMPLATE1_LABEL, template1Data } from "./template1";

export type OfferTemplateEntry = {
  id: string;
  label: string;
  data: Data;
};

/** First non-empty CoverImage URL in the document — matches the opening frame of the hover preview. */
export function getTemplateCoverThumbnailSrc(data: Data): string | undefined {
  const content = Array.isArray(data.content) ? data.content : [];
  for (const item of content) {
    if (item.type === "CoverImage") {
      const src = (item.props as { imageSrc?: string }).imageSrc;
      if (typeof src === "string" && src.trim()) return src.trim();
    }
  }
  return undefined;
}

export const offerTemplates: OfferTemplateEntry[] = [
  {
    id: "template1",
    label: TEMPLATE1_LABEL,
    data: template1Data,
  },
];
