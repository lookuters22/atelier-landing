import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useGoogleConnectedAccount } from "../../../hooks/useInboxGmailLabels";
import { fetchThreadRowForEscalationDeepLink } from "../../../lib/inboxEscalationDeepLink";
import { fireDataChanged } from "../../../lib/events";
import { invokeGmailInboxSendCompose } from "../../../lib/gmailInboxSend";
import { useInboxMode } from "./InboxModeContext";

const TEXTAREA_MAX_PX = 480;

/**
 * New outbound message from scratch — sends via Gmail when Google is connected and healthy.
 */
export function InboxScratchCompose() {
  const { setScratchComposeOpen, selectThread } = useInboxMode();
  const { photographerId } = useAuth();
  const { googleAccount } = useGoogleConnectedAccount(photographerId ?? null);
  const { refetch } = useUnfiledInbox();
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const gmailComposeReady = Boolean(
    googleAccount?.id &&
      (googleAccount.sync_status === "connected" || googleAccount.sync_status === "syncing"),
  );

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [body]);

  async function handleSend() {
    setSendError(null);
    if (!photographerId || !googleAccount?.id) {
      setSendError("Sign in and connect Google to send.");
      return;
    }
    if (!gmailComposeReady) {
      setSendError(
        googleAccount?.sync_status === "error" || googleAccount?.sync_status === "disconnected"
          ? "Reconnect Google in Settings to send."
          : "Connect Google in Settings to send.",
      );
      return;
    }
    if (!to.trim() || !body.trim()) {
      setSendError("To and message body are required.");
      return;
    }
    setSending(true);
    const result = await invokeGmailInboxSendCompose({
      connectedAccountId: googleAccount.id,
      to: to.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      subject: subject.trim(),
      body: body.trim(),
    });
    setSending(false);
    if (!result.ok) {
      setSendError(result.error);
      return;
    }
    fireDataChanged("inbox");
    await refetch();
    const row = await fetchThreadRowForEscalationDeepLink(result.threadId);
    if (row) {
      selectThread(row);
    }
    setScratchComposeOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={() => setScratchComposeOpen(false)}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-border bg-background px-3 text-[12px] font-medium transition hover:bg-accent"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
          Back to inbox
        </button>
        <h1 className="text-[15px] font-semibold text-foreground">New message</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {!gmailComposeReady ? (
          <p className="mb-4 rounded-md border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
            Connect Google in Settings and ensure the account is connected to send new mail from here.
          </p>
        ) : null}
        {sendError ? (
          <p
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
            role="alert"
            aria-live="polite"
          >
            {sendError}
          </p>
        ) : null}

        <div className="rounded-lg border border-border bg-muted/20 p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2 text-[12px]">
            <label className="w-10 shrink-0 text-muted-foreground" htmlFor="scratch-to">
              To
            </label>
            <input
              id="scratch-to"
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="min-w-0 flex-1 rounded border border-transparent bg-background px-2 py-1.5 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
              placeholder="Recipients"
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCc((s) => !s)}
                className={`text-[11px] font-medium ${showCc ? "text-foreground" : "text-muted-foreground"}`}
              >
                Cc
              </button>
              <button
                type="button"
                onClick={() => setShowBcc((s) => !s)}
                className={`text-[11px] font-medium ${showBcc ? "text-foreground" : "text-muted-foreground"}`}
              >
                Bcc
              </button>
            </div>
          </div>

          {showCc ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <label className="w-10 shrink-0 text-muted-foreground" htmlFor="scratch-cc">
                Cc
              </label>
              <input
                id="scratch-cc"
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="min-w-0 flex-1 rounded border border-transparent bg-background px-2 py-1.5 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
                autoComplete="off"
              />
            </div>
          ) : null}

          {showBcc ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[12px]">
              <label className="w-10 shrink-0 text-muted-foreground" htmlFor="scratch-bcc">
                Bcc
              </label>
              <input
                id="scratch-bcc"
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="min-w-0 flex-1 rounded border border-transparent bg-background px-2 py-1.5 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
                autoComplete="off"
              />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[12px]">
            <label className="w-10 shrink-0 text-muted-foreground" htmlFor="scratch-subject">
              Subject
            </label>
            <input
              id="scratch-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="min-w-0 flex-1 rounded border border-transparent bg-background px-2 py-1.5 text-[13px] outline-none focus:border-border focus:ring-1 focus:ring-ring"
              placeholder="Subject"
              autoComplete="off"
            />
          </div>

          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Write your message…"
            className="mt-4 w-full min-h-[160px] resize-none overflow-y-auto rounded-md border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ maxHeight: TEXTAREA_MAX_PX }}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
            <button
              type="button"
              disabled={sending || !gmailComposeReady}
              onClick={() => void handleSend()}
              className="inline-flex items-center gap-1 rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              title={!gmailComposeReady ? "Connect Google in Settings" : undefined}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              {sending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setScratchComposeOpen(false)}
              className="text-[12px] text-muted-foreground underline underline-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
