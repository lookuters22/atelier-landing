import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  deriveOperatorAnaFocusFromPathname,
  operatorAnaFocusBadgeLabel,
} from "../lib/operatorStudioAssistantFocus.ts";
import {
  buildOperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantInvokePayload,
} from "../lib/operatorStudioAssistantWidgetResult.ts";

type ChatRole = "user" | "assistant";
type ChatLine =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; display: OperatorStudioAssistantAssistantDisplay };

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function AnaWidgetSendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function AnaWidgetCloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function AssistantDevRetrievalBlock(props: { scopes: string[]; memoryIds: string[] }) {
  const scopes = props.scopes.length ? props.scopes.join(", ") : "-";
  const memories = props.memoryIds.length ? props.memoryIds.join(", ") : "none";
  return (
    <details className="mt-2 rounded-md border border-white/[0.12] bg-black/25 px-2 py-1.5 text-left">
      <summary className="cursor-pointer list-none font-['SaansMono',ui-monospace,monospace] text-[9px] uppercase tracking-wide text-white/45 outline-none [&::-webkit-details-marker]:hidden">
        Retrieval (dev)
      </summary>
      <dl className="mt-1.5 space-y-1 font-['SaansMono',ui-monospace,monospace] text-[9px] leading-snug text-white/55">
        <div>
          <dt className="inline text-white/40">Scopes</dt>
          <dd className="inline pl-1 break-all">{scopes}</dd>
        </div>
        <div>
          <dt className="inline text-white/40">Memories</dt>
          <dd className="inline pl-1 break-all">{memories}</dd>
        </div>
      </dl>
    </details>
  );
}

const ANA_QUERY_EVENT = "ana-widget:open-with-query";

export function openAnaWithQuery(query: string) {
  window.dispatchEvent(new CustomEvent(ANA_QUERY_EVENT, { detail: { query } }));
}

type PanelDir = { v: "above" | "below"; h: "alignRight" | "alignLeft" };

export function SupportAssistantWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [anaTyping, setAnaTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dir, setDir] = useState<PanelDir>({ v: "above", h: "alignRight" });

  const listRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const pathFocus = deriveOperatorAnaFocusFromPathname(pathname);
  const focusLabel = operatorAnaFocusBadgeLabel(pathFocus);

  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  function computeDir() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const v = r.top > 350 ? "above" : "below";
    const h = r.left > 340 ? "alignRight" : "alignLeft";
    setDir({ v: v as PanelDir["v"], h: h as PanelDir["h"] });
  }

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, anaTyping, open]);

  const pendingQuery = useRef<string | null>(null);

  useEffect(() => {
    function handleAnaQuery(e: Event) {
      const query = (e as CustomEvent).detail?.query;
      if (!query) return;
      pendingQuery.current = query;
      setOpen(true);
    }
    window.addEventListener(ANA_QUERY_EVENT, handleAnaQuery);
    return () => window.removeEventListener(ANA_QUERY_EVENT, handleAnaQuery);
  }, []);

  useEffect(() => {
    if (open && pendingQuery.current) {
      const q = pendingQuery.current;
      pendingQuery.current = null;
      setTimeout(() => submitQuestion(q), 60);
    }
  }, [open]);

  async function submitQuestion(overrideText?: string) {
    const text = (overrideText ?? question).trim();
    if (!text || isSubmitting) return;

    const userLine: ChatLine = { id: nextId(), role: "user", text };
    setMessages((m) => [...m, userLine]);
    setQuestion("");
    setIsSubmitting(true);
    setAnaTyping(true);

    const { weddingId: focusedWeddingId } = pathFocus;

    try {
      const { data, error } = await supabase.functions.invoke("operator-studio-assistant", {
        body: {
          queryText: text,
          focusedWeddingId: focusedWeddingId ?? null,
          focusedPersonId: null,
        },
      });
      if (error) throw error;

      const display = buildOperatorStudioAssistantAssistantDisplay(
        data as OperatorStudioAssistantInvokePayload | null,
        { devMode: import.meta.env.DEV },
      );

      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          display,
        },
      ]);
      setAnaTyping(false);
      setIsSubmitting(false);
    } catch (err) {
      setAnaTyping(false);
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to send message: ${msg}`);
    }
  }

  const panelPositionClass = [
    "absolute w-[min(100vw-2rem,320px)]",
    dir.v === "above" ? "bottom-full mb-2" : "top-full mt-2",
    dir.h === "alignRight" ? "right-0" : "left-0",
  ].join(" ");

  return (
    <>
      <div ref={constraintsRef} className="pointer-events-none fixed inset-0 z-[79]" />

      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={constraintsRef}
        onDragStart={() => {
          isDragging.current = true;
          dragStartPos.current = { x: dragX.get(), y: dragY.get() };
        }}
        onDragEnd={() => {
          const dx = Math.abs(dragX.get() - dragStartPos.current.x);
          const dy = Math.abs(dragY.get() - dragStartPos.current.y);
          if (dx > 3 || dy > 3) {
            setTimeout(() => {
              isDragging.current = false;
            }, 0);
          } else {
            isDragging.current = false;
          }
          if (open) computeDir();
        }}
        className="ana-support-dock pointer-events-auto fixed bottom-[22px] right-5 z-[60]"
        style={{ touchAction: "none", x: dragX, y: dragY, overflow: "visible" }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              id="support-assistant-panel"
              className={`ana-widget-glass-panel pointer-events-auto flex max-h-[min(70vh,380px)] flex-col px-3 py-3 ${panelPositionClass}`}
              role="dialog"
              aria-label="Ana studio assistant"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.85 }}
            >
              {focusLabel && (
                <div
                  className="mb-2 flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1.5"
                  role="status"
                  aria-label={focusLabel}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                    aria-hidden
                  />
                  <span className="font-['Saans',ui-sans-serif] text-[11px] leading-tight text-white/[0.88]">
                    {focusLabel}
                  </span>
                </div>
              )}

              <div
                ref={listRef}
                className="ana-widget-body flex-1 space-y-4 overflow-y-auto overscroll-contain pr-0.5"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.length === 0 && !anaTyping && (
                  <div className="flex h-full min-h-[140px] flex-col justify-center gap-3 py-4 text-left">
                    <div className="flex items-center gap-2">
                      <span className="ana-badge-logo shrink-0" aria-hidden>
                        a
                      </span>
                      <p className="font-['Saans',ui-sans-serif] text-[13px] font-medium leading-snug text-white/[0.92]">
                        Studio Ana
                      </p>
                    </div>
                    <p className="font-['Saans',ui-sans-serif] text-[12px] leading-[1.5] text-white/70">
                      Ask about playbook rules, studio memory, schedules, or the project you have open. Replies
                      are for you and your team, not to forward to clients.
                    </p>
                    <p className="font-['SaansMono',ui-monospace,monospace] text-[10px] leading-relaxed text-white/45">
                      Examples: policy checks, &quot;what do we know about this couple?&quot;, reminders, CRM
                      context.
                    </p>
                  </div>
                )}
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="ana-widget-role mb-1">{m.role === "user" ? "You" : "Ana"}</p>
                    {m.role === "user" ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.92]">{m.text}</p>
                    ) : m.display.kind === "contract_violation" ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-amber-200/95">
                        {m.display.mainText}
                      </p>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.92]">
                          {m.display.mainText}
                        </p>
                        <p className="mt-2 border-l border-white/20 pl-2 font-['Saans',ui-sans-serif] text-[10px] leading-relaxed text-white/50">
                          {m.display.operatorRibbon}
                        </p>
                        {m.display.devRetrieval && (
                          <AssistantDevRetrievalBlock
                            scopes={m.display.devRetrieval.scopes}
                            memoryIds={m.display.devRetrieval.memoryIds}
                          />
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}
                {anaTyping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <p className="ana-widget-role mb-1">Ana</p>
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <span
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/40"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </span>
                  </motion.div>
                )}
              </div>

              <div className="mt-3 shrink-0">
                <div className="ana-widget-input-well focus-within:border-white/[0.18]">
                  <textarea
                    id="support-question"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        submitQuestion();
                      }
                    }}
                    rows={1}
                    placeholder="Ask about policy, memory, or this project..."
                    disabled={isSubmitting}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 font-['Saans',ui-sans-serif] text-[12px] text-white/[0.94] placeholder:text-white/35 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex items-center justify-between px-2 pb-1.5">
                    <span className="max-w-[70%] font-['SaansMono',ui-monospace,monospace] text-[9px] uppercase leading-tight tracking-[0.5px] text-white/40">
                      Operator workspace - not a client reply box
                    </span>
                    <button
                      type="button"
                      onClick={() => submitQuestion()}
                      disabled={isSubmitting || !question.trim()}
                      className="ana-widget-send disabled:opacity-35"
                      aria-label="Send"
                    >
                      <AnaWidgetSendIcon />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          type="button"
          ref={btnRef}
          title="Ana (studio assistant)"
          onClick={() => {
            if (isDragging.current) return;
            if (!open) computeDir();
            setOpen((o) => !o);
          }}
          className="relative cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
          aria-expanded={open}
          aria-controls="support-assistant-panel"
        >
          <span className="ana-badge-port">
            {open ? (
              <>
                <AnaWidgetCloseIcon />
                <span className="text-[12px]">Close</span>
              </>
            ) : (
              <>
                <span className="ana-badge-logo" aria-hidden>
                  a
                </span>
                <span>Ana</span>
              </>
            )}
          </span>
        </motion.button>
      </motion.div>
    </>
  );
}
