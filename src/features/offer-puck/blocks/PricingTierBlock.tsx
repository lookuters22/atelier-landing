import type { PuckComponent } from "@measured/puck";
import { useCallback, useEffect, useRef, useState } from "react";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "../inlineEditStopDrag";
import { usePatchComponentProps } from "../usePatchComponentProps";

export type PricingFeatureLine = {
  text: string;
};

export type PricingTierProps = {
  tierName: string;
  price: string;
  features: PricingFeatureLine[];
  footerNote: string;
};

export const PricingTierBlock: PuckComponent<PricingTierProps> = ({
  id,
  tierName,
  price,
  features,
  footerNote,
}) => {
  const patch = usePatchComponentProps(id);
  const lines = Array.isArray(features) ? features : [];

  const [editTier, setEditTier] = useState(false);
  const [editPrice, setEditPrice] = useState(false);
  const [editFooter, setEditFooter] = useState(false);
  const [editLine, setEditLine] = useState<number | null>(null);

  const tierRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);
  const lineRef = useRef<HTMLTextAreaElement>(null);

  useInlineEditStopDrag(tierRef, editTier);
  useInlineEditStopDrag(priceRef, editPrice);
  useInlineEditStopDrag(footerRef, editFooter);
  useInlineEditStopDrag(lineRef, editLine !== null, editLine);

  useEffect(() => {
    if (editTier) tierRef.current?.focus();
  }, [editTier]);
  useEffect(() => {
    if (editPrice) priceRef.current?.focus();
  }, [editPrice]);
  useEffect(() => {
    if (editFooter) footerRef.current?.focus();
  }, [editFooter]);
  useEffect(() => {
    if (editLine !== null) lineRef.current?.focus();
  }, [editLine]);

  const patchLine = useCallback(
    (index: number, text: string) => {
      const next = lines.map((line, i) => (i === index ? { ...line, text } : line));
      patch({ features: next });
    },
    [lines, patch],
  );

  return (
    <section className="w-full border-t border-neutral-200/80 py-12">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-10">
        <div>
          {editTier ? (
            <input
              ref={tierRef}
              type="text"
              defaultValue={tierName}
              draggable={false}
              {...inlineEditStopDragProps}
              className="w-full max-w-md rounded border border-neutral-200 bg-white px-2 py-1 text-[10px] font-normal uppercase tracking-[0.28em] text-neutral-800"
              onBlur={() => {
                patch({ tierName: tierRef.current?.value ?? "" });
                setEditTier(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditTier(false);
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <p
              className="cursor-text text-[10px] font-normal uppercase tracking-[0.28em] text-neutral-500"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditTier(true);
              }}
            >
              {tierName}
            </p>
          )}
          {editPrice ? (
            <input
              ref={priceRef}
              type="text"
              defaultValue={price}
              draggable={false}
              {...inlineEditStopDragProps}
              className="mt-2 w-full max-w-md rounded border border-neutral-200 bg-white px-2 py-1 font-serif text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl"
              onBlur={() => {
                patch({ price: priceRef.current?.value ?? "" });
                setEditPrice(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditPrice(false);
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          ) : (
            <p
              className="mt-2 cursor-text font-serif text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditPrice(true);
              }}
            >
              {price}
            </p>
          )}
        </div>
        <ul className="max-w-xl flex-1 space-y-2.5 text-sm font-light leading-relaxed text-neutral-700">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-400" aria-hidden />
              {editLine === i ? (
                <textarea
                  key={i}
                  ref={lineRef}
                  defaultValue={line.text}
                  rows={3}
                  draggable={false}
                  {...inlineEditStopDragProps}
                  className="min-h-[3rem] w-full resize-y rounded border border-neutral-200 bg-white p-2 text-sm"
                  onBlur={() => {
                    patchLine(i, lineRef.current?.value ?? "");
                    setEditLine(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditLine(null);
                  }}
                />
              ) : (
                <span
                  className="cursor-text"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditLine(i);
                  }}
                >
                  {line.text}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {editFooter ? (
        <textarea
          ref={footerRef}
          defaultValue={footerNote}
          rows={3}
          draggable={false}
          {...inlineEditStopDragProps}
          className="mt-8 w-full resize-y rounded border border-neutral-200 bg-white p-2 text-[12px] font-light leading-relaxed text-neutral-500"
          onBlur={() => {
            patch({ footerNote: footerRef.current?.value ?? "" });
            setEditFooter(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditFooter(false);
          }}
        />
      ) : (
        <p
          className="mt-8 cursor-text text-[12px] font-light leading-relaxed text-neutral-500"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditFooter(true);
          }}
        >
          {footerNote || "Double-click to add footer note"}
        </p>
      )}
    </section>
  );
};
