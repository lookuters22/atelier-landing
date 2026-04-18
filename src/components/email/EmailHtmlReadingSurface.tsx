import type { ReactNode } from "react";

/**
 * Centered host width for the HTML email iframe (`min(100%, this)`).
 *
 * Gmail’s message body is a **narrow column** (~600–720px) inside the reading pane, with
 * visible side margins. That is the viewport against which `width:100%` and centered tables resolve.
 * A very wide stage (e.g. 1200px) makes MYCO-style marketing HTML stretch edge-to-edge and look
 * “full width and all over the place” instead of the centered gray-gutter layout in Gmail.
 *
 * Adobe-style gray “wings” still render **inside** this width (same as Gmail’s Adobe view).
 */
export const EMAIL_STAGE_MAX_WIDTH_PX = 720;

/**
 * Centered stage for {@link EmailHtmlIframe}: clips at the host edge.
 */
export function EmailHtmlReadingSurface({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pb-3 pt-2">
      <div
        className="mx-auto w-full min-w-0 max-w-full overflow-x-clip"
        style={{
          maxWidth: `min(100%, ${EMAIL_STAGE_MAX_WIDTH_PX}px)`,
          contain: "paint",
        }}
      >
        {children}
      </div>
    </div>
  );
}
