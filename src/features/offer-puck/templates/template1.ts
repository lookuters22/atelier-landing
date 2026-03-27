import type { Data } from "@measured/puck";

/** Preset magazine layout (Danilo & Sharon–style investment guide). */
export const TEMPLATE1_LABEL = "Template 1";

export const template1Data: Data = {
  root: {
    props: {
      title: "Investment Guide 2026 - Danilo & Sharon",
    },
  },
  content: [
    {
      type: "CoverImage",
      props: {
        id: "a1b2c3d4-e5f6-4000-a000-000000000001",
        title: "INFOBOOK 2026",
        subtitle: "DANILO & SHARON",
        imageSrc:
          "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&q=80&w=2000",
        align: "bottom-center",
      },
    },
    {
      type: "StatementBlock",
      props: {
        id: "a1b2c3d4-e5f6-4000-a000-000000000002",
        body:
          "WE INVITE YOU to take a moment to explore how OUR VISIONS ALIGN through the VALUES, PHILOSOPHY, AND CREATIVE PROCESS in this INVESTMENT GUIDE curated and designed for EXTRAORDINARY COUPLES, like you.",
        alignment: "center",
      },
    },
    {
      type: "GalleryGrid",
      props: {
        id: "a1b2c3d4-e5f6-4000-a000-000000000003",
        columns: 2,
        caption: "DORCHESTER — Jessica and Alexander, London 2025",
        items: [
          {
            src: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&q=80&w=1000",
            aspectRatio: 1,
            fit: "cover",
          },
          {
            src: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=1000",
            aspectRatio: 1,
            fit: "cover",
          },
        ],
      },
    },
    {
      type: "SplitBlock",
      props: {
        id: "a1b2c3d4-e5f6-4000-a000-000000000004",
        imageSrc:
          "https://images.unsplash.com/photo-1543087903-1ac2ec7aa8c5?auto=format&fit=crop&q=80&w=1000",
        body:
          "We're that inseparable couple, together since we were 14. Nearly two decades of living, breathing, and understanding love firsthand.\n\nComing from a pure fashion background, we approached it differently: blending direction with candor, striking beauty with raw emotion.",
        imageSide: "left",
        splitRatio: 0.5,
      },
    },
    {
      type: "PricingTier",
      props: {
        id: "a1b2c3d4-e5f6-4000-a000-000000000005",
        tierName: "NUMERO 01",
        price: "49.000 €",
        features: [
          { text: "Danilo and Sharon + one photographer" },
          { text: "Wedding day photography (12h)" },
          { text: "Rehearsal dinner photography (3h)" },
          { text: "Welcome party / brunch photography (3h)" },
          { text: "Film Photography incl." },
          { text: "Drone Photography incl. (if permitted)" },
          { text: "1 Jumbo Reflections PhotoBook (200 pages, 35x40)" },
        ],
        footerNote: "No VAT applies. Extended coverage is available at 1.500 €/hour.",
      },
    },
  ],
};
