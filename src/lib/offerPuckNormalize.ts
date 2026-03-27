import type { Data } from "@measured/puck";
import type { CoverImageProps } from "../features/offer-puck/blocks/CoverImageBlock";
import type { SplitBlockProps } from "../features/offer-puck/blocks/SplitBlock";
import type { GalleryItem } from "../features/offer-puck/blocks/GalleryGridBlock";

const COVER_IMAGE_DEFAULTS: CoverImageProps = {
  imageSrc: "",
  title: "Collection",
  subtitle: "",
  align: "bottom-left",
  sectionMaxWidth: "full",
  aspectMobile: "3/4",
  aspectDesktop: "16/10",
  imageFit: "cover",
  imageFocalX: 50,
  imageFocalY: 50,
  imageScale: 1,
};

const GALLERY_ITEM_DEFAULTS: Pick<GalleryItem, "aspectRatio" | "fit" | "focalX" | "focalY" | "zoom"> = {
  aspectRatio: 1,
  fit: "cover",
  focalX: 50,
  focalY: 50,
  zoom: 1,
};

const SPLIT_BLOCK_DEFAULTS = {
  imageFit: "cover",
  imageFocalX: 50,
  imageFocalY: 50,
  imageScale: 1,
} as const;

function numericOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function defaultPuckData(): Data {
  return {
    root: { props: { title: "Investment guide" } },
    content: [],
  };
}

export function normalizeStoredContent(content: Data["content"]): Data["content"] {
  return content.map((item) => {
    if (item.type === "CoverImage") {
      return {
        ...item,
        props: {
          ...COVER_IMAGE_DEFAULTS,
          ...(item.props as object),
        },
      };
    }
    if (item.type === "GalleryGrid") {
      const p = item.props as { items?: unknown; columns?: unknown; caption?: string; id?: string; cropModeActive?: unknown };
      const items = Array.isArray(p.items)
        ? p.items.map((it) => ({
            ...GALLERY_ITEM_DEFAULTS,
            ...(typeof it === "object" && it ? it : {}),
            aspectRatio: numericOr((it as GalleryItem | undefined)?.aspectRatio, GALLERY_ITEM_DEFAULTS.aspectRatio),
            focalX: numericOr((it as GalleryItem | undefined)?.focalX, GALLERY_ITEM_DEFAULTS.focalX ?? 50),
            focalY: numericOr((it as GalleryItem | undefined)?.focalY, GALLERY_ITEM_DEFAULTS.focalY ?? 50),
            zoom: numericOr((it as GalleryItem | undefined)?.zoom, GALLERY_ITEM_DEFAULTS.zoom ?? 1),
            fit: (it as GalleryItem | undefined)?.fit === "contain" ? "contain" : "cover",
          }))
        : [{ src: "", ...GALLERY_ITEM_DEFAULTS }];
      return {
        ...item,
        props: {
          ...p,
          items,
          columns: p.columns === 3 ? 3 : 2,
          caption: typeof p.caption === "string" ? p.caption : "",
          cropModeActive: false,
        },
      };
    }
    if (item.type === "SplitBlock") {
      const p = item.props as SplitBlockProps;
      return {
        ...item,
        props: {
          ...p,
          imageFit: p?.imageFit === "contain" ? "contain" : SPLIT_BLOCK_DEFAULTS.imageFit,
          imageFocalX: numericOr(p?.imageFocalX, SPLIT_BLOCK_DEFAULTS.imageFocalX),
          imageFocalY: numericOr(p?.imageFocalY, SPLIT_BLOCK_DEFAULTS.imageFocalY),
          imageScale: numericOr(p?.imageScale, SPLIT_BLOCK_DEFAULTS.imageScale),
        },
      };
    }
    return item;
  });
}

export function projectDisplayName(data: Data): string {
  const t = (data.root?.props as { title?: string } | undefined)?.title?.trim();
  return t || "Untitled";
}

export function normalizePuckData(raw: Data): Data {
  const fallback = defaultPuckData();
  return {
    ...fallback,
    ...raw,
    root: {
      ...fallback.root,
      ...raw.root,
      props: {
        ...fallback.root.props,
        ...(raw.root.props ?? {}),
      },
    },
    content: normalizeStoredContent(Array.isArray(raw.content) ? raw.content : []),
  };
}
