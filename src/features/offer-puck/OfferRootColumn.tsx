import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "./inlineEditStopDrag";
import { magazine } from "./magazineClasses";
import { usePatchRootProps } from "./usePatchRootProps";

type OfferRootColumnProps = {
  children: ReactNode;
  title?: string;
};

export function OfferRootColumn({ children, title = "" }: OfferRootColumnProps) {
  const patchRoot = usePatchRootProps();
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useInlineEditStopDrag(inputRef, editing);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    patchRoot({ title: inputRef.current?.value ?? "" });
    setEditing(false);
  }, [patchRoot]);

  return (
    <div className={magazine.rootColumn}>
      <header className="border-b border-neutral-200/80 pb-8">
        <p className={magazine.microLabel}>Document</p>
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            defaultValue={title}
            draggable={false}
            {...inlineEditStopDragProps}
            className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 font-serif text-2xl font-light tracking-tight text-neutral-900"
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter") commit();
            }}
          />
        ) : (
          <h1
            className="cursor-text font-serif text-2xl font-light tracking-tight text-neutral-900"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {title || "Untitled"}
          </h1>
        )}
      </header>
      {children}
    </div>
  );
}
