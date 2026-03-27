import type { PuckComponent } from "@measured/puck";
import { useCallback, useEffect, useRef, useState } from "react";
import { inlineEditStopDragProps, useInlineEditStopDrag } from "../inlineEditStopDrag";
import { usePatchComponentProps } from "../usePatchComponentProps";

export type StatementBlockProps = {
  body: string;
  alignment: "left" | "center" | "right";
};

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export const StatementBlock: PuckComponent<StatementBlockProps> = ({ id, body, alignment }) => {
  const ac = alignClass[alignment] ?? alignClass.center;
  const patch = usePatchComponentProps(id);
  const [editing, setEditing] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useInlineEditStopDrag(taRef, editing);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    const v = taRef.current?.value ?? "";
    patch({ body: v });
    setEditing(false);
  }, [patch]);

  return (
    <section className="w-full border-t border-neutral-200/80 py-12">
      {editing ? (
        <textarea
          ref={taRef}
          defaultValue={body}
          draggable={false}
          {...inlineEditStopDragProps}
          className={`w-full resize-y rounded-lg border border-neutral-200 bg-white p-3 font-serif text-base font-light leading-[1.85] tracking-wide text-neutral-800 sm:text-lg ${ac}`}
          rows={6}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          role="textbox"
          tabIndex={0}
          className={`cursor-text select-text font-serif text-base font-light leading-[1.85] tracking-wide text-neutral-800 sm:text-lg ${ac} whitespace-pre-wrap`}
          onDoubleClickCapture={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {body}
        </p>
      )}
    </section>
  );
};
