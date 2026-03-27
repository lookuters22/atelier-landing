import type { Config } from "@measured/puck";
import type { ReactNode } from "react";
import { CoverImageBlock, type CoverImageProps } from "./blocks/CoverImageBlock";
import { GalleryGridBlock, type GalleryGridProps, type GalleryItem } from "./blocks/GalleryGridBlock";
import { PricingTierBlock, type PricingFeatureLine, type PricingTierProps } from "./blocks/PricingTierBlock";
import { SplitBlock, type SplitBlockProps } from "./blocks/SplitBlock";
import { StatementBlock, type StatementBlockProps } from "./blocks/StatementBlock";
import { OfferRootColumn } from "./OfferRootColumn";

export type OfferPuckComponents = {
  CoverImage: CoverImageProps;
  StatementBlock: StatementBlockProps;
  SplitBlock: SplitBlockProps;
  GalleryGrid: GalleryGridProps;
  PricingTier: PricingTierProps;
};

export const offerPuckConfig = {
  categories: {
    blocks: {
      title: "Blocks",
      components: ["CoverImage", "StatementBlock", "GalleryGrid", "SplitBlock", "PricingTier"],
      defaultExpanded: true,
    },
  },
  components: {
    CoverImage: {
      label: "Cover image",
      fields: {
        imageSrc: { type: "text", label: "Image URL" },
        title: { type: "text", label: "Title" },
        subtitle: { type: "textarea", label: "Subtitle" },
        align: {
          type: "select",
          label: "Overlay",
          options: [
            { label: "Bottom left", value: "bottom-left" },
            { label: "Center", value: "center" },
            { label: "Bottom center", value: "bottom-center" },
          ],
        },
        sectionMaxWidth: {
          type: "select",
          label: "Section max width",
          options: [
            { label: "Full", value: "full" },
            { label: "3xl", value: "3xl" },
            { label: "5xl", value: "5xl" },
            { label: "7xl", value: "7xl" },
          ],
        },
        aspectMobile: {
          type: "select",
          label: "Frame aspect (mobile)",
          options: [
            { label: "3:4 portrait", value: "3/4" },
            { label: "1:1 square", value: "1/1" },
            { label: "4:5", value: "4/5" },
          ],
        },
        aspectDesktop: {
          type: "select",
          label: "Frame aspect (desktop)",
          options: [
            { label: "16:10", value: "16/10" },
            { label: "3:2", value: "3/2" },
            { label: "16:9", value: "16/9" },
            { label: "1:1", value: "1/1" },
          ],
        },
        imageFit: {
          type: "radio",
          label: "Image in frame",
          options: [
            { label: "Cover (fill, crop)", value: "cover" },
            { label: "Contain (letterbox)", value: "contain" },
          ],
        },
        imageFocalX: {
          type: "number",
          label: "Image focal X (0–100)",
          min: 0,
          max: 100,
        },
        imageFocalY: {
          type: "number",
          label: "Image focal Y (0–100)",
          min: 0,
          max: 100,
        },
        imageScale: {
          type: "number",
          label: "Image zoom (1–1.5)",
          min: 1,
          max: 1.5,
        },
      },
      defaultProps: {
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
      },
      render: CoverImageBlock,
    },
    StatementBlock: {
      label: "Statement",
      fields: {
        body: { type: "textarea", label: "Body" },
        alignment: {
          type: "radio",
          label: "Alignment",
          options: [
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ],
        },
      },
      defaultProps: {
        body: "",
        alignment: "center",
      },
      render: StatementBlock,
    },
    SplitBlock: {
      label: "Image & text",
      fields: {
        imageSrc: { type: "text", label: "Image URL" },
        body: { type: "textarea", label: "Text" },
        imageSide: {
          type: "radio",
          label: "Image side",
          options: [
            { label: "Left", value: "left" },
            { label: "Right", value: "right" },
          ],
        },
        splitRatio: {
          type: "number",
          label: "Image width (0.35–0.75)",
          min: 0.35,
          max: 0.75,
        },
      },
      defaultProps: {
        imageSrc: "",
        body: "Write a short editorial line. Typography stays light and spacious.",
        imageSide: "left",
        splitRatio: 0.5,
        imageFit: "cover",
        imageFocalX: 50,
        imageFocalY: 50,
        imageScale: 1,
      },
      render: SplitBlock,
    },
    GalleryGrid: {
      label: "Gallery grid",
      permissions: {
        drag: true,
      },
      resolvePermissions: (data: { props?: GalleryGridProps }) => ({
        drag: !(data.props?.cropModeActive ?? false),
      }),
      fields: {
        caption: { type: "textarea", label: "Caption (optional)" },
        columns: {
          type: "radio",
          label: "Columns",
          options: [
            { label: "2", value: 2 },
            { label: "3", value: 3 },
          ],
        },
        items: {
          type: "array",
          label: "Images",
          arrayFields: {
            src: { type: "text", label: "Image URL" },
            aspectRatio: { type: "number", label: "Aspect ratio", min: 0.45, max: 2.2 },
            fit: {
              type: "radio",
              label: "Fit",
              options: [
                { label: "Cover", value: "cover" },
                { label: "Contain", value: "contain" },
              ],
            },
          },
          defaultItemProps: {
            src: "",
            aspectRatio: 1,
            fit: "cover",
            focalX: 50,
            focalY: 50,
            zoom: 1,
          },
          getItemSummary: (item: GalleryItem, i?: number) => item.src?.slice(0, 24) || `Image ${(i ?? 0) + 1}`,
          min: 1,
          max: 12,
        },
      },
      defaultProps: {
        caption: "",
        columns: 2,
        cropModeActive: false,
        items: [
          {
            src: "",
            aspectRatio: 1,
            fit: "cover",
            focalX: 50,
            focalY: 50,
            zoom: 1,
          },
        ],
      },
      render: GalleryGridBlock,
    },
    PricingTier: {
      label: "Pricing tier",
      fields: {
        tierName: { type: "text", label: "Tier name" },
        price: { type: "text", label: "Price" },
        features: {
          type: "array",
          label: "Features",
          arrayFields: {
            text: { type: "textarea", label: "Line" },
          },
          defaultItemProps: { text: "" },
          getItemSummary: (item: PricingFeatureLine) => item.text?.slice(0, 32) || "Feature",
          min: 1,
          max: 24,
        },
        footerNote: { type: "textarea", label: "Footer note" },
      },
      defaultProps: {
        tierName: "NUMERO 01",
        price: "",
        features: [{ text: "" }],
        footerNote: "",
      },
      render: PricingTierBlock,
    },
  },
  root: {
    fields: {
      title: { type: "text", label: "Document title" },
    },
    defaultProps: {
      title: "Investment guide",
    },
    render: (props: { children: ReactNode; title?: string }) => {
      const { children, title } = props;
      return (
        <OfferRootColumn title={title}>
          {children}
        </OfferRootColumn>
      );
    },
  },
} as unknown as Config;
