import type { Data } from "@measured/puck";
import type { PuckComponent } from "@measured/puck";
import { usePuck } from "@measured/puck";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InlineImageFrameEditor, normalizeInlineImageDraft, type InlineImageEditorState } from "../InlineImageFrameEditor";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "../inlineEditStopDrag";
import { magazine } from "../magazineClasses";
import { openFilePickerWithoutScrollJump } from "../openFilePickerWithoutScrollJump";
import { usePatchComponentProps } from "../usePatchComponentProps";

const MAX_BYTES = 750_000;

export type GalleryItem = {
  src: string;
  aspectRatio: number;
  fit: "cover" | "contain";
  focalX?: number;
  focalY?: number;
  zoom?: number;
};

export type GalleryGridProps = {
  items: GalleryItem[];
  columns: 2 | 3;
  caption?: string;
  cropModeActive?: boolean;
};

type GalleryCropDraft = {
  src: string;
  aspectRatio: number;
  fit: "cover" | "contain";
  focalX: number;
  focalY: number;
  zoom: number;
};

type GalleryCropEditorState = InlineImageEditorState<GalleryCropDraft> & {
  index: number;
};

const GALLERY_ITEM_DEFAULTS = {
  aspectRatio: 1,
  focalX: 50,
  focalY: 50,
  zoom: 1,
} as const;

function parseNumeric(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeGalleryItem(item: GalleryItem): GalleryItem {
  return {
    ...item,
    aspectRatio: clamp(parseNumeric(item.aspectRatio, GALLERY_ITEM_DEFAULTS.aspectRatio), 0.45, 2.2),
    fit: item.fit === "contain" ? "contain" : "cover",
    focalX: clamp(parseNumeric(item.focalX, GALLERY_ITEM_DEFAULTS.focalX), 0, 100),
    focalY: clamp(parseNumeric(item.focalY, GALLERY_ITEM_DEFAULTS.focalY), 0, 100),
    zoom: clamp(parseNumeric(item.zoom, GALLERY_ITEM_DEFAULTS.zoom), 1, 2.4),
  };
}

function patchGalleryItems(prev: Data, id: string, index: number, partial: Partial<GalleryItem>): Data {
  return {
    ...prev,
    content: (prev.content ?? []).map((item) =>
      item.props?.id === id
        ? {
            ...item,
            props: {
              ...item.props,
              items: (Array.isArray(item.props.items) ? item.props.items : []).map((it: GalleryItem, i: number) =>
                i === index ? normalizeGalleryItem({ ...it, ...partial }) : normalizeGalleryItem(it),
              ),
            },
          }
        : item,
    ),
  };
}

export const GalleryGridBlock: PuckComponent<GalleryGridProps> = ({
  id,
  items: itemsProp,
  columns: columnsProp,
  caption,
  cropModeActive,
  editMode,
}) => {
  const items = Array.isArray(itemsProp) ? itemsProp : [];
  const columns: 2 | 3 = columnsProp === 3 ? 3 : 2;
  const { dispatch } = usePuck();
  const patchBlock = usePatchComponentProps(id);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizingCell = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingIndex = useRef<number | null>(null);
  const [editCaption, setEditCaption] = useState(false);
  const [cropEditor, setCropEditor] = useState<GalleryCropEditorState | null>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const fileInputId = useId();

  useInlineEditStopDrag(captionRef, editCaption);
  useInlineEditStopDrag(fileInputRef, Boolean(editMode));

  useEffect(() => {
    if (editCaption) captionRef.current?.focus();
  }, [editCaption]);

  const patchItem = useCallback(
    (index: number, partial: Partial<GalleryItem>) => {
      dispatch({
        type: "setData",
        data: (prev: Data) => patchGalleryItems(prev, id, index, partial),
      });
    },
    [dispatch, id],
  );

  const setCropMode = useCallback(
    (next: boolean) => {
      patchBlock({ cropModeActive: next });
    },
    [patchBlock],
  );

  const closeCropEditor = useCallback(() => {
    setCropEditor(null);
    setCropMode(false);
  }, [setCropMode]);

  const commitCropEditor = useCallback(() => {
    if (!cropEditor) return;
    patchItem(cropEditor.index, {
      focalX: cropEditor.draft.focalX,
      focalY: cropEditor.draft.focalY,
      zoom: cropEditor.draft.zoom,
    });
    closeCropEditor();
  }, [closeCropEditor, cropEditor, patchItem]);

  useEffect(() => {
    if (!cropModeActive && cropEditor) {
      setCropEditor(null);
    }
  }, [cropEditor, cropModeActive]);

  useEffect(() => {
    if (!cropEditor) return;

    const updateFrameRect = () => {
      const cell = gridRef.current?.querySelector(`[data-gallery-cell-index="${cropEditor.index}"]`) as HTMLElement | null;
      if (!cell) return;
      const nextRect = cell.getBoundingClientRect();
      setCropEditor((current) => (current ? { ...current, frameRect: nextRect } : current));
    };

    window.addEventListener("resize", updateFrameRect);
    window.addEventListener("scroll", updateFrameRect, true);
    return () => {
      window.removeEventListener("resize", updateFrameRect);
      window.removeEventListener("scroll", updateFrameRect, true);
    };
  }, [cropEditor]);

  const onCellResizePointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      if (!editMode) return;
      e.preventDefault();
      e.stopPropagation();
      resizingCell.current = index;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [editMode],
  );

  const onCellResizePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const idx = resizingCell.current;
      if (idx === null || !gridRef.current) return;
      const cells = gridRef.current.querySelectorAll("[data-gallery-cell]");
      const cell = cells[idx] as HTMLElement | undefined;
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const dx = e.clientX - rect.left;
      const dy = e.clientY - rect.top;
      patchItem(idx, { aspectRatio: clamp(dx / Math.max(1, dy), 0.45, 2.2) });
    },
    [patchItem],
  );

  const onCellResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (resizingCell.current === null) return;
    resizingCell.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const idx = pendingIndex.current;
      pendingIndex.current = null;
      if (!file || !file.type.startsWith("image/") || idx === null) return;
      if (file.size > MAX_BYTES) {
        window.alert(`Image must be under ${Math.round(MAX_BYTES / 1000)}KB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => patchItem(idx, { src: reader.result as string });
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [patchItem],
  );

  const prepareImagePicker = useCallback((index: number) => {
    pendingIndex.current = index;
    openFilePickerWithoutScrollJump(fileInputRef.current);
  }, []);

  const openCropEditor = useCallback(
    (index: number) => {
      const normalizedItem = normalizeGalleryItem(items[index] ?? { src: "", aspectRatio: 1, fit: "cover" });
      const item = normalizeInlineImageDraft<GalleryCropDraft>({
        src: normalizedItem.src,
        aspectRatio: normalizedItem.aspectRatio,
        fit: normalizedItem.fit,
        focalX: normalizedItem.focalX ?? 50,
        focalY: normalizedItem.focalY ?? 50,
        zoom: normalizedItem.zoom ?? 1,
      });
      if (!item.src) return;
      const cell = gridRef.current?.querySelector(`[data-gallery-cell-index="${index}"]`) as HTMLElement | null;
      if (!cell) return;

      const image = new window.Image();
      image.onload = () => {
        setCropEditor({
          index,
          draft: item,
          frameRect: cell.getBoundingClientRect(),
          naturalWidth: image.naturalWidth || cell.clientWidth,
          naturalHeight: image.naturalHeight || cell.clientHeight,
        });
        setCropMode(true);
      };
      image.onerror = () => {
        setCropEditor({
          index,
          draft: item,
          frameRect: cell.getBoundingClientRect(),
          naturalWidth: cell.clientWidth,
          naturalHeight: cell.clientHeight,
        });
        setCropMode(true);
      };
      image.src = item.src;
    },
    [editMode, items, setCropMode],
  );

  const gridCols = columns === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <section className={magazine.galleryWrap}>
      <p className={`${magazine.microLabel} mb-6`}>Gallery</p>
      <div ref={gridRef} className={`${magazine.galleryGrid} ${gridCols}`}>
        {items.map((item, index) => {
          const normalizedItem = normalizeGalleryItem(item);
          const isCropping = cropEditor?.index === index;

          return (
            <div
              key={index}
              data-gallery-cell
              data-gallery-cell-index={index}
              className={`${magazine.galleryCell} ${isCropping ? "ring-2 ring-black/70 ring-inset" : ""}`}
              style={{ aspectRatio: normalizedItem.aspectRatio }}
              onDoubleClick={(e) => {
                if (!normalizedItem.src) return;
                e.preventDefault();
                e.stopPropagation();
                openCropEditor(index);
              }}
            >
              {normalizedItem.src ? (
                <img
                  src={normalizedItem.src}
                  alt=""
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className={magazine.galleryImg}
                  style={{
                    opacity: isCropping ? 0 : 1,
                    objectFit: normalizedItem.fit,
                    objectPosition: `${normalizedItem.focalX}% ${normalizedItem.focalY}%`,
                    transform: `scale(${normalizedItem.zoom})`,
                    transformOrigin: `${normalizedItem.focalX}% ${normalizedItem.focalY}%`,
                  }}
                />
              ) : (
                <div className="flex h-full min-h-[120px] items-center justify-center bg-neutral-50">
                  <span className="text-[10px] uppercase tracking-widest text-neutral-400">Empty</span>
                </div>
              )}

              {editMode ? (
                <>
                  <label
                    htmlFor={fileInputId}
                    className={`absolute bottom-2 left-2 z-20 cursor-pointer rounded bg-black/40 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-white backdrop-blur-sm ${isCropping ? "pointer-events-none opacity-0" : ""}`}
                    onPointerDownCapture={(e) => {
                      prepareImagePicker(index);
                      inlineEditStopDragProps.onPointerDownCapture(e);
                    }}
                    onMouseDownCapture={inlineEditStopDragProps.onMouseDownCapture}
                  >
                    Image
                  </label>
                  {!isCropping ? (
                    <button
                      type="button"
                      aria-label="Resize crop"
                      className="absolute bottom-1 right-1 z-20 h-4 w-4 cursor-nwse-resize touch-none rounded-br border-b-2 border-r-2 border-white/90 bg-black/20 shadow-sm"
                      {...inlineEditStopDragProps}
                      onPointerDown={(e) => onCellResizePointerDown(index, e)}
                      onPointerMove={onCellResizePointerMove}
                      onPointerUp={onCellResizePointerUp}
                      onPointerCancel={onCellResizePointerUp}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      {editCaption ? (
        <textarea
          ref={captionRef}
          defaultValue={caption ?? ""}
          rows={2}
          draggable={false}
          {...inlineEditStopDragProps}
          className="mt-6 w-full resize-y rounded border border-neutral-200 bg-white p-2 text-center text-[11px] font-light uppercase tracking-[0.2em] text-neutral-700"
          onBlur={() => {
            patchBlock({ caption: captionRef.current?.value ?? "" });
            setEditCaption(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditCaption(false);
          }}
        />
      ) : (
        <p
          className={`mt-6 text-center text-[11px] font-light uppercase tracking-[0.2em] text-neutral-700 ${editMode ? "cursor-text" : ""}`}
          onDoubleClickCapture={(e) => {
            e.stopPropagation();
            if (editMode) setEditCaption(true);
          }}
        >
          {caption || "Optional caption"}
        </p>
      )}
      <input
        ref={fileInputRef}
        id={fileInputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onPickFile}
      />
      <InlineImageFrameEditor
        editor={cropEditor}
        setEditor={setCropEditor}
        onCommit={commitCropEditor}
        onCancel={closeCropEditor}
      />
    </section>
  );
};
