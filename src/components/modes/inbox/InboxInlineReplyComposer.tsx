import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  ChevronDown,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  Type,
} from "lucide-react";

const TEXTAREA_MAX_PX = 480;

export type InboxComposeVariant = "reply" | "forward";

export interface InboxInlineReplyComposerProps {
  variant: InboxComposeVariant;
  threadId: string;
  to: string;
  onToChange: (v: string) => void;
  cc: string;
  onCcChange: (v: string) => void;
  bcc: string;
  onBccChange: (v: string) => void;
  showCc: boolean;
  showBcc: boolean;
  onToggleCc: () => void;
  onToggleBcc: () => void;
  body: string;
  onBodyChange: (v: string) => void;
  onDiscard: () => void;
  onSend?: () => void | Promise<void>;
  /** When set, Send is disabled (e.g. forward stub or missing Gmail transport). */
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  sending?: boolean;
  /** Stub: attachment pipeline not wired for unfiled inbox */
  onAttach?: () => void;
  /** `message`: nested under thread row; `feed`: bottom-of-feed spacing. */
  layout?: "feed" | "message";
  /** Use `.ana-draft` / `.btn-send` structure under `.ana-inbox-port` (live Ana inbox). */
  anaVisuals?: boolean;
  /** Shown in `.ana-draft-foot` mono summary line (e.g. routing intent). */
  routingFootMeta?: string | null;
  /** Optional extra line in Ana foot (e.g. routing reasoning). */
  routingFootDetail?: ReactNode;
}

export function InboxInlineReplyComposer({
  variant,
  threadId,
  to,
  onToChange,
  cc,
  onCcChange,
  bcc,
  onBccChange,
  showCc,
  showBcc,
  onToggleCc,
  onToggleBcc,
  body,
  onBodyChange,
  onDiscard,
  onSend,
  sendDisabled = false,
  sendDisabledReason,
  sending = false,
  onAttach,
  layout = "feed",
  anaVisuals = false,
  routingFootMeta = null,
  routingFootDetail = null,
}: InboxInlineReplyComposerProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
  }, [body]);

  const placeholder =
    variant === "forward"
      ? "Forward message (draft only — not sent)…"
      : "Write your reply…";

  const cardTitle = variant === "forward" ? "Forward" : "Reply";

  const inputClsAna =
    "min-w-0 flex-1 rounded border border-[var(--border-default)] bg-[var(--surface-canvas)] px-2 py-1 text-[13px] text-[var(--fg-1)] outline-none focus:border-[var(--color-fin)] focus:ring-1 focus:ring-[var(--color-fin)]/25";

  const forwardStubNoteDefault =
    variant === "forward" ? (
      <p className="mb-2 rounded-md border border-dashed border-border/80 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
        Forward is draft-only here — not connected to mail send. Edit To and message below.
      </p>
    ) : null;

  const forwardStubNoteAna =
    variant === "forward" ? (
      <p className="mb-3 rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-canvas)] px-2 py-1.5 text-[11px] text-[var(--fg-3)]">
        Forward is draft-only here — not connected to mail send. Edit To and message below.
      </p>
    ) : null;

  function handleSend() {
    void onSend?.();
  }

  const sendBlocked = sendDisabled || sending;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && !body.trim()) {
      e.preventDefault();
      onDiscard();
    }
  }

  const shell =
    layout === "message"
      ? "px-0 pt-2"
      : "mx-5 mt-4 border-t border-border/60 pt-4";

  const shellAna = layout === "message" ? "px-0 pt-2" : "mx-0 mt-4 border-t border-[var(--border-default)] pt-4";

  if (anaVisuals) {
    return (
      <div className={shellAna}>
        <div className="ana-draft" role="region" aria-label={`${cardTitle} composer`}>
          {forwardStubNoteAna}

          <div className="ana-draft-head">
            <div className="left">
              <div className="badge">
                <span className="dot" aria-hidden />
                {cardTitle}
              </div>
            </div>
          </div>

          <div className="ana-draft-body">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
              <label htmlFor={`inbox-reply-to-${threadId}`} className="w-8 shrink-0 text-[var(--fg-4)]">
                To
              </label>
              <input
                id={`inbox-reply-to-${threadId}`}
                type="text"
                value={to}
                onChange={(e) => onToChange(e.target.value)}
                className={inputClsAna}
                autoComplete="off"
              />
              <div className="flex w-full shrink-0 items-center gap-2 sm:ml-auto sm:w-auto">
                <button
                  type="button"
                  onClick={onToggleCc}
                  className={
                    "text-[11px] font-medium " +
                    (showCc ? "text-[var(--fg-1)]" : "text-[var(--fg-4)] hover:text-[var(--fg-2)]")
                  }
                >
                  Cc
                </button>
                <button
                  type="button"
                  onClick={onToggleBcc}
                  className={
                    "text-[11px] font-medium " +
                    (showBcc ? "text-[var(--fg-1)]" : "text-[var(--fg-4)] hover:text-[var(--fg-2)]")
                  }
                >
                  Bcc
                </button>
              </div>
            </div>

            {showCc ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
                <label htmlFor={`inbox-reply-cc-${threadId}`} className="w-8 shrink-0 text-[var(--fg-4)]">
                  Cc
                </label>
                <input
                  id={`inbox-reply-cc-${threadId}`}
                  type="text"
                  value={cc}
                  onChange={(e) => onCcChange(e.target.value)}
                  className={inputClsAna}
                  autoComplete="off"
                />
              </div>
            ) : null}

            {showBcc ? (
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
                <label htmlFor={`inbox-reply-bcc-${threadId}`} className="w-8 shrink-0 text-[var(--fg-4)]">
                  Bcc
                </label>
                <input
                  id={`inbox-reply-bcc-${threadId}`}
                  type="text"
                  value={bcc}
                  onChange={(e) => onBccChange(e.target.value)}
                  className={inputClsAna}
                  autoComplete="off"
                />
              </div>
            ) : null}

            <textarea
              ref={bodyRef}
              id={`inbox-reply-body-${threadId}`}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder={placeholder}
              className="mt-3 w-full min-h-[120px] resize-none overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--surface-canvas)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--fg-1)] placeholder:text-[var(--fg-4)] focus:border-[var(--color-fin)] focus:outline-none focus:ring-1 focus:ring-[var(--color-fin)]/25"
              style={{ maxHeight: TEXTAREA_MAX_PX }}
            />

            <div className="mt-2 min-h-[28px] flex flex-wrap gap-1.5">
              <span className="text-[11px] text-[var(--fg-4)]">No attachments</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border-default)] pt-3">
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--fg-3)] transition hover:bg-[oklab(0.145_0_0/0.04)]"
                aria-label="More send options (coming later)"
                title="Scheduling and alternate send — coming later"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onAttach?.();
                  console.debug("[inbox] attach: not wired for unfiled thread");
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-3)] transition hover:bg-[oklab(0.145_0_0/0.04)] hover:text-[var(--fg-1)]"
                aria-label="Attach file"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-3)] transition hover:bg-[oklab(0.145_0_0/0.04)] hover:text-[var(--fg-1)]"
                aria-label="Text formatting"
                title="Formatting"
              >
                <Type className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--fg-3)] transition hover:bg-[oklab(0.145_0_0/0.04)] hover:text-[var(--fg-1)]"
                aria-label="AI assist"
                title="AI assist"
              >
                <Sparkles className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          <div className="ana-draft-foot">
            <div className="left">
              {routingFootMeta ? <span className="conf">{routingFootMeta}</span> : null}
              {routingFootDetail ? (
                <span className="max-w-[min(420px,55vw)] text-[10px] font-normal normal-case tracking-normal text-[var(--fg-3)]">
                  {routingFootDetail}
                </span>
              ) : null}
            </div>
            <div className="actions">
              <button
                type="button"
                onClick={handleSend}
                disabled={sendBlocked}
                title={sendDisabledReason}
                className="btn-send"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" strokeWidth={2} />
                {sending ? "Sending…" : "Send"}
              </button>
              <button type="button" onClick={onDiscard} className="btn-ghostline">
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div
        className="rounded-lg border border-border bg-muted/25 p-3 shadow-sm"
        role="region"
        aria-label={`${cardTitle} composer`}
      >
        {forwardStubNoteDefault}

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
          <label htmlFor={`inbox-reply-to-${threadId}`} className="w-8 shrink-0 text-muted-foreground">
            To
          </label>
          <input
            id={`inbox-reply-to-${threadId}`}
            type="text"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className="min-w-0 flex-1 rounded border border-transparent bg-background/80 px-2 py-1 text-[13px] text-foreground outline-none ring-0 transition focus:border-border focus:ring-1 focus:ring-ring"
            autoComplete="off"
          />
          <div className="flex w-full shrink-0 items-center gap-2 sm:ml-auto sm:w-auto">
            <button
              type="button"
              onClick={onToggleCc}
              className={
                "text-[11px] font-medium " +
                (showCc ? "text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              Cc
            </button>
            <button
              type="button"
              onClick={onToggleBcc}
              className={
                "text-[11px] font-medium " +
                (showBcc ? "text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              Bcc
            </button>
          </div>
        </div>

        {showCc ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
            <label htmlFor={`inbox-reply-cc-${threadId}`} className="w-8 shrink-0 text-muted-foreground">
              Cc
            </label>
            <input
              id={`inbox-reply-cc-${threadId}`}
              type="text"
              value={cc}
              onChange={(e) => onCcChange(e.target.value)}
              className="min-w-0 flex-1 rounded border border-transparent bg-background/80 px-2 py-1 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
              autoComplete="off"
            />
          </div>
        ) : null}

        {showBcc ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
            <label htmlFor={`inbox-reply-bcc-${threadId}`} className="w-8 shrink-0 text-muted-foreground">
              Bcc
            </label>
            <input
              id={`inbox-reply-bcc-${threadId}`}
              type="text"
              value={bcc}
              onChange={(e) => onBccChange(e.target.value)}
              className="min-w-0 flex-1 rounded border border-transparent bg-background/80 px-2 py-1 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
              autoComplete="off"
            />
          </div>
        ) : null}

        <textarea
          ref={bodyRef}
          id={`inbox-reply-body-${threadId}`}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={4}
          placeholder={placeholder}
          className="mt-3 w-full min-h-[120px] resize-none overflow-y-auto rounded-md border border-transparent bg-background/90 px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ maxHeight: TEXTAREA_MAX_PX }}
        />

        <div className="mt-2 min-h-[28px] flex flex-wrap gap-1.5">
          <span className="text-[11px] text-muted-foreground/80">No attachments</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-border/50 pt-3">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={sendBlocked}
              title={sendDisabledReason}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} />
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition hover:bg-accent"
              aria-label="More send options (coming later)"
              title="Scheduling and alternate send — coming later"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                onAttach?.();
                console.debug("[inbox] attach: not wired for unfiled thread");
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Attach file"
              title="Attach file"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="Text formatting"
              title="Formatting"
            >
              <Type className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              aria-label="AI assist"
              title="AI assist"
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
          <button
            type="button"
            onClick={onDiscard}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            aria-label="Discard reply"
            title="Discard"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
