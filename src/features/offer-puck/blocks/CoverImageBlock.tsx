import type { PuckComponent } from "@measured/puck";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InlineImageFrameEditor, normalizeInlineImageDraft, type InlineImageEditorState } from "../InlineImageFrameEditor";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "../inlineEditStopDrag";
import { magazine } from "../magazineClasses";
import { openFilePickerWithoutScrollJump } from "../openFilePickerWithoutScrollJump";
import { useMediaQuery } from "../useMediaQuery";
import { usePatchComponentProps } from "../usePatchComponentProps";

const MAX_BYTES = 750_000;

export type CoverImageProps = {
  imageSrc: string;
  title: string;
  subtitle: string;
  align: "bottom-left" | "center" | "bottom-center";
  /** Max width of this block (section) — responsive container */
  sectionMaxWidth: "full" | "3xl" | "5xl" | "7xl";
  /** Aspect ratio of the cover frame (mobile, &lt; sm) — e.g. "3/4" */
  aspectMobile: string;
  /** Aspect ratio of the cover frame (sm+) — e.g. "16/10" */
  aspectDesktop: string;
  /** How the photo sits inside the frame */
  imageFit: "cover" | "contain";
  /** Horizontal focal point for object-position / scale origin (0–100) */
  imageFocalX: number;
  /** Vertical focal point (0–100) */
  imageFocalY: number;
  /** Zoom inside the frame (1 = none) */
  imageScale: number;
};

const alignMap = {
  "bottom-left": "items-end justify-start text-left",
  center: "items-center justify-center text-center",
  "bottom-center": "items-end justify-center text-center",
} as const;

const sectionMaxClass: Record<CoverImageProps["sectionMaxWidth"], string> = {
  full: "max-w-none",
  "3xl": "max-w-3xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
};

function cssAspect(s: string): string {
  const t = (s || "3/4").trim();
  return t.includes("/") ? t.replace(/\s*\/\s*/, " / ") : "3 / 4";
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type CoverCropDraft = {
  src: string;
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
  zoom: number;
};

export const CoverImageBlock: PuckComponent<CoverImageProps> = ({
  id,
  imageSrc,
  title,
  subtitle,
  align,
  editMode,
  sectionMaxWidth = "full",
  aspectMobile = "3/4",
  aspectDesktop = "16/10",
  imageFit = "cover",
  imageFocalX = 50,
  imageFocalY = 50,
  imageScale = 1,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const subRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const patch = usePatchComponentProps(id);
  const [editTitle, setEditTitle] = useState(false);
  const [editSub, setEditSub] = useState(false);
  const [cropEditor, setCropEditor] = useState<InlineImageEditorState<CoverCropDraft> | null>(null);
  const alignKey = align && align in alignMap ? align : "bottom-left";
  const alignClass = alignMap[alignKey];
  const isMd = useMediaQuery("(min-width: 640px)");
  const aspect = cssAspect(isMd ? aspectDesktop : aspectMobile);
  const fx = clamp(Number.isFinite(imageFocalX) ? imageFocalX : 50, 0, 100);
  const fy = clamp(Number.isFinite(imageFocalY) ? imageFocalY : 50, 0, 100);
  const scale = clamp(Number.isFinite(imageScale) ? imageScale : 1, 1, 1.5);
  const maxW = sectionMaxClass[sectionMaxWidth] ?? sectionMaxClass.full;

  useInlineEditStopDrag(titleRef, editTitle);
  useInlineEditStopDrag(subRef, editSub);
  useInlineEditStopDrag(inputRef, Boolean(editMode));

  useEffect(() => {
    if (editTitle) titleRef.current?.focus();
  }, [editTitle]);
  useEffect(() => {
    if (editSub) subRef.current?.focus();
  }, [editSub]);

  useEffect(() => {
    if (!cropEditor) return;
    const updateFrameRect = () => {
      const node = frameRef.current;
      if (!node) return;
      const nextRect = node.getBoundingClientRect();
      setCropEditor((current) => (current ? { ...current, frameRect: nextRect } : current));
    };
    window.addEventListener("resize", updateFrameRect);
    window.addEventListener("scroll", updateFrameRect, true);
    return () => {
      window.removeEventListener("resize", updateFrameRect);
      window.removeEventListener("scroll", updateFrameRect, true);
    };
  }, [cropEditor]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > MAX_BYTES) {
        window.alert(`Image must be under ${Math.round(MAX_BYTES / 1000)}KB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        patch({ imageSrc: reader.result as string });
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [patch],
  );

  const preserveScrollOnPickerOpen = useCallback(() => {
    openFilePickerWithoutScrollJump(inputRef.current);
  }, []);

  const openCropEditor = useCallback(() => {
    if (!imageSrc || !frameRef.current) return;
    const image = new window.Image();
    const draft = normalizeInlineImageDraft({
      src: imageSrc,
      fit: imageFit,
      focalX: fx,
      focalY: fy,
      zoom: scale,
    });
    image.onload = () => {
      setCropEditor({
        draft,
        frameRect: frameRef.current!.getBoundingClientRect(),
        naturalWidth: image.naturalWidth || frameRef.current!.clientWidth,
        naturalHeight: image.naturalHeight || frameRef.current!.clientHeight,
      });
    };
    image.onerror = () => {
      setCropEditor({
        draft,
        frameRect: frameRef.current!.getBoundingClientRect(),
        naturalWidth: frameRef.current!.clientWidth,
        naturalHeight: frameRef.current!.clientHeight,
      });
    };
    image.src = imageSrc;
  }, [editMode, fx, fy, imageFit, imageSrc, scale]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || !imageSrc) return;
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("[data-cover-text-edit], label, button, input, textarea")) return;
      event.preventDefault();
      event.stopPropagation();
      openCropEditor();
    };
    node.addEventListener("dblclick", onDoubleClick, { capture: true });
    return () => {
      node.removeEventListener("dblclick", onDoubleClick, { capture: true });
    };
  }, [imageSrc, openCropEditor]);

  const commitCropEditor = useCallback(() => {
    if (!cropEditor) return;
    patch({
      imageFit: cropEditor.draft.fit,
      imageFocalX: cropEditor.draft.focalX,
      imageFocalY: cropEditor.draft.focalY,
      imageScale: cropEditor.draft.zoom,
    });
    setCropEditor(null);
  }, [cropEditor, patch]);

  return (
    <section className={`group relative mx-auto w-full shrink-0 ${maxW}`}>
      <div ref={frameRef} className={`${magazine.coverWrap} shrink-0`} style={{ aspectRatio: aspect }}>
        <input
          ref={inputRef}
          id={fileInputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={onFile}
        />
        <div className={magazine.coverImgClip}>
          {imageSrc ? (
            <img
              src={imageSrc}
              alt=""
              className={`${magazine.coverImg} pointer-events-auto`}
              style={{
                objectFit: imageFit,
                objectPosition: `${fx}% ${fy}%`,
                transform: `scale(${scale})`,
                transformOrigin: `${fx}% ${fy}%`,
              }}
            />
          ) : (
            <label
              htmlFor={fileInputId}
              {...inlineEditStopDragProps}
              className={`absolute inset-0 flex cursor-pointer items-center justify-center bg-neutral-900 text-neutral-400 ${editMode ? "" : "pointer-events-none opacity-60"}`}
              onPointerDownCapture={() => preserveScrollOnPickerOpen()}
            >
              <span className={magazine.microLabel}>Add image</span>
            </label>
          )}
        </div>
        <div className={magazine.coverScrim} />
        <div className={`pointer-events-none absolute inset-0 flex p-8 sm:p-12 ${alignClass}`}>
          <div className="max-w-lg pointer-events-auto" data-cover-text-edit>
            <p className={magazine.microLabel}>Cover</p>
            {editTitle ? (
              <input
                ref={titleRef}
                type="text"
                defaultValue={title}
                draggable={false}
                {...inlineEditStopDragProps}
                className={`${magazine.coverTitle} w-full rounded border border-white/30 bg-black/20 px-2 py-1 text-inherit placeholder:text-white/50`}
                onBlur={() => {
                  patch({ title: titleRef.current?.value ?? "" });
                  setEditTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditTitle(false);
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <h2
                className={`${magazine.coverTitle} cursor-text select-text`}
                onDoubleClickCapture={(e) => {
                  e.stopPropagation();
                  setEditTitle(true);
                }}
              >
                {title || "Title"}
              </h2>
            )}
            {editSub ? (
              <textarea
                ref={subRef}
                defaultValue={subtitle}
                rows={3}
                draggable={false}
                {...inlineEditStopDragProps}
                className={`${magazine.coverSubtitle} mt-2 w-full rounded border border-white/30 bg-black/20 px-2 py-1 text-inherit placeholder:text-white/50`}
                onBlur={() => {
                  patch({ subtitle: subRef.current?.value ?? "" });
                  setEditSub(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setEditSub(false);
                }}
              />
            ) : (
              <p
                className={`${magazine.coverSubtitle} cursor-text select-text ${subtitle ? "" : "opacity-70"}`}
                onDoubleClickCapture={(e) => {
                  e.stopPropagation();
                  setEditSub(true);
                }}
              >
                {subtitle || "Double-click to add subtitle"}
              </p>
            )}
          </div>
        </div>

        {editMode && imageSrc ? (
          <div className="pointer-events-auto absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2">
            <label
              htmlFor={fileInputId}
              {...inlineEditStopDragProps}
              className="cursor-pointer rounded-full border border-white/50 bg-black/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm backdrop-blur-sm hover:bg-black/65"
              onPointerDownCapture={() => preserveScrollOnPickerOpen()}
            >
              Replace image
            </label>
          </div>
        ) : null}
      </div>
      <InlineImageFrameEditor
        editor={cropEditor}
        setEditor={setCropEditor}
        onCommit={commitCropEditor}
        onCancel={() => setCropEditor(null)}
        maxZoom={1.5}
      />
    </section>
  );
};
