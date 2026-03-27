import type { PuckComponent } from "@measured/puck";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InlineImageFrameEditor, normalizeInlineImageDraft, type InlineImageEditorState } from "../InlineImageFrameEditor";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "../inlineEditStopDrag";
import { magazine } from "../magazineClasses";
import { openFilePickerWithoutScrollJump } from "../openFilePickerWithoutScrollJump";
import { useMediaQuery } from "../useMediaQuery";
import { usePatchComponentProps } from "../usePatchComponentProps";

const MAX_BYTES = 750_000;

export type SplitBlockProps = {
  imageSrc: string;
  body: string;
  imageSide: "left" | "right";
  splitRatio: number;
  imageFit?: "cover" | "contain";
  imageFocalX?: number;
  imageFocalY?: number;
  imageScale?: number;
};

type SplitCropDraft = {
  src: string;
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
  zoom: number;
};

export const SplitBlock: PuckComponent<SplitBlockProps> = ({
  id,
  imageSrc,
  body,
  imageSide,
  splitRatio,
  imageFit = "cover",
  imageFocalX = 50,
  imageFocalY = 50,
  imageScale = 1,
  editMode,
}) => {
  const patch = usePatchComponentProps(id);
  const [editingBody, setEditingBody] = useState(false);
  const [cropEditor, setCropEditor] = useState<InlineImageEditorState<SplitCropDraft> | null>(null);
  const bodyTaRef = useRef<HTMLTextAreaElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const imageColRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const isMd = useMediaQuery("(min-width: 768px)");

  const clampRatio = (r: number) => Math.min(0.75, Math.max(0.35, r));
  const safeRatio =
    typeof splitRatio === "number" && Number.isFinite(splitRatio) ? clampRatio(splitRatio) : 0.5;
  const side = imageSide === "right" ? "right" : "left";
  const fx = Math.max(0, Math.min(100, Number.isFinite(imageFocalX) ? imageFocalX : 50));
  const fy = Math.max(0, Math.min(100, Number.isFinite(imageFocalY) ? imageFocalY : 50));
  const scale = Math.max(1, Math.min(2.4, Number.isFinite(imageScale) ? imageScale : 1));

  useInlineEditStopDrag(bodyTaRef, editingBody);

  useEffect(() => {
    if (editingBody) bodyTaRef.current?.focus();
  }, [editingBody]);

  useEffect(() => {
    if (!cropEditor) return;
    const updateFrameRect = () => {
      const node = imageColRef.current;
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

  useEffect(() => {
    const handleNode = handleRef.current;
    if (!handleNode || !editMode || !isMd) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragging.current = true;
      activePointerId.current = event.pointerId;
      try {
        handleNode.setPointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
    };

    const stopMouseActivation = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging.current || activePointerId.current !== event.pointerId || !rowRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = rowRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const w = rect.width;
      let ratio = x / w;
      if (side === "right") {
        ratio = 1 - x / w;
      }
      patch({ splitRatio: clampRatio(ratio) });
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragging.current || activePointerId.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      dragging.current = false;
      activePointerId.current = null;
      try {
        handleRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        /* noop */
      }
    };

    handleNode.addEventListener("pointerdown", onPointerDown, { capture: true });
    handleNode.addEventListener("mousedown", stopMouseActivation, { capture: true });
    handleNode.addEventListener("click", stopMouseActivation, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", endDrag, { capture: true });
    window.addEventListener("pointercancel", endDrag, { capture: true });
    return () => {
      handleNode.removeEventListener("pointerdown", onPointerDown, { capture: true });
      handleNode.removeEventListener("mousedown", stopMouseActivation, { capture: true });
      handleNode.removeEventListener("click", stopMouseActivation, { capture: true });
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", endDrag, { capture: true });
      window.removeEventListener("pointercancel", endDrag, { capture: true });
    };
  }, [editMode, isMd, patch, side]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      if (file.size > MAX_BYTES) {
        window.alert(`Image must be under ${Math.round(MAX_BYTES / 1000)}KB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => patch({ imageSrc: reader.result as string });
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [patch],
  );

  const preserveScrollOnPickerOpen = useCallback(() => {
    openFilePickerWithoutScrollJump(inputRef.current);
  }, []);

  const openCropEditor = useCallback(() => {
    if (!imageSrc || !imageColRef.current) return;
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
        frameRect: imageColRef.current!.getBoundingClientRect(),
        naturalWidth: image.naturalWidth || imageColRef.current!.clientWidth,
        naturalHeight: image.naturalHeight || imageColRef.current!.clientHeight,
      });
    };
    image.onerror = () => {
      setCropEditor({
        draft,
        frameRect: imageColRef.current!.getBoundingClientRect(),
        naturalWidth: imageColRef.current!.clientWidth,
        naturalHeight: imageColRef.current!.clientHeight,
      });
    };
    image.src = imageSrc;
  }, [editMode, fx, fy, imageFit, imageSrc, scale]);

  useEffect(() => {
    const node = imageColRef.current;
    if (!node || !imageSrc) return;
    const onDoubleClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("label, button, input, textarea")) return;
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

  const imageStyle = isMd ? ({ flexBasis: `${safeRatio * 100}%` } as const) : undefined;

  const imageCol = (
    <div
      ref={imageColRef}
      className={`${magazine.splitImgCol} w-full shrink-0 md:min-w-0`}
      style={imageStyle}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={magazine.splitImg}
          style={{
            objectFit: imageFit,
            objectPosition: `${fx}% ${fy}%`,
            transform: `scale(${scale})`,
            transformOrigin: `${fx}% ${fy}%`,
          }}
        />
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center bg-neutral-100">
          <span className={magazine.microLabel}>Image</span>
        </div>
      )}
      {editMode ? (
        <>
          <input
            ref={inputRef}
            id={fileInputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onFile}
          />
          <label
            htmlFor={fileInputId}
            {...inlineEditStopDragProps}
            className="absolute bottom-3 left-3 cursor-pointer rounded-full border border-white/40 bg-black/30 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white backdrop-blur-sm"
            onPointerDownCapture={() => preserveScrollOnPickerOpen()}
          >
            Swap
          </label>
        </>
      ) : null}
    </div>
  );

  const textCol = (
    <div className={`${magazine.splitTextCol} w-full flex-1`}>
      <p className={magazine.microLabel}>Editorial</p>
      {editingBody ? (
        <textarea
          ref={bodyTaRef}
          defaultValue={body}
          rows={8}
          draggable={false}
          {...inlineEditStopDragProps}
          className={`${magazine.splitBody} w-full resize-y rounded-lg border border-neutral-200 bg-white p-2`}
          onBlur={() => {
            patch({ body: bodyTaRef.current?.value ?? "" });
            setEditingBody(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditingBody(false);
          }}
        />
      ) : (
        <div
          className={`${magazine.splitBody} cursor-text select-text whitespace-pre-wrap`}
          onDoubleClickCapture={(e) => {
            e.stopPropagation();
            setEditingBody(true);
          }}
        >
          {body || "…"}
        </div>
      )}
    </div>
  );

  const handle = editMode && isMd ? (
    <button
      ref={handleRef}
      type="button"
      aria-label="Resize columns"
      className={`${magazine.splitHandle} touch-none select-none`}
    >
      <span className="h-10 w-px bg-neutral-300" />
    </button>
  ) : (
    <div className={`${magazine.splitHandle} pointer-events-none max-md:hidden`}>
      <span className="h-10 w-px bg-neutral-200" />
    </div>
  );

  return (
    <>
      <section className="w-full">
        <div ref={rowRef} className={`${magazine.splitOuter} flex-col md:flex-row`}>
          {side === "left" ? (
            <>
              {imageCol}
              {handle}
              {textCol}
            </>
          ) : (
            <>
              {textCol}
              {handle}
              {imageCol}
            </>
          )}
        </div>
      </section>
      <InlineImageFrameEditor
        editor={cropEditor}
        setEditor={setCropEditor}
        onCommit={commitCropEditor}
        onCancel={() => setCropEditor(null)}
      />
    </>
  );
};
