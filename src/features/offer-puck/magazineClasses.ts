/** Shared Tailwind class strings for Puck blocks + HTML export (same visual language). */

export const magazine = {
  /** Match canvas width — avoid a narrow column with large side gutters in the editor. */
  rootColumn: "mx-auto w-full max-w-none space-y-16 px-4 py-12 sm:px-8",
  microLabel: "text-[10px] font-normal uppercase tracking-[0.28em] text-neutral-500",
  /** Aspect ratio is set per-block (props); keep overflow hidden for image scale/crop. */
  coverWrap: "relative w-full overflow-hidden bg-neutral-950",
  coverImgClip: "absolute inset-0 overflow-hidden",
  coverImg: "h-full w-full",
  coverScrim:
    "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent",
  coverTitle:
    "font-serif text-3xl font-light tracking-tight text-white sm:text-4xl md:text-5xl",
  coverSubtitle: "mt-3 max-w-md text-sm font-light leading-relaxed text-white/85",
  splitOuter: "flex w-full flex-col gap-0 border-y border-neutral-200/80 md:flex-row",
  splitImgCol: "relative min-h-[220px] overflow-hidden bg-neutral-100 md:min-h-[320px]",
  splitImg: "h-full w-full object-cover",
  splitTextCol: "flex flex-1 flex-col justify-center bg-white px-6 py-10 md:px-10",
  splitBody: "text-sm font-light leading-[1.85] text-neutral-700",
  splitHandle:
    "hidden w-3 shrink-0 cursor-col-resize items-center justify-center border-x border-neutral-200 bg-neutral-50 md:flex",
  galleryWrap: "w-full border-t border-neutral-200/80 pt-10",
  galleryGrid: "grid w-full gap-px bg-neutral-200 p-px",
  galleryCell: "relative overflow-hidden bg-white",
  galleryImg: "h-full w-full object-cover",
} as const;
