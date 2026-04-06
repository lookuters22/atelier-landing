import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { supabase } from "../lib/supabase";
import { OBSIDIAN_GLASS } from "@/lib/obsidianGlass";

type ChatRole = "user" | "assistant";
type ChatLine = { id: string; role: ChatRole; text: string };

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Same obsidian glass as ZenLobby KPI cards + priority feed */
const OBSIDIAN_PANEL = `rounded-xl border-0 ${OBSIDIAN_GLASS} text-white/90`;
const OBSIDIAN_TRIGGER = `min-h-[44px] min-w-[100px] rounded-[999px] border-0 ${OBSIDIAN_GLASS} text-white`;


const ANA_QUERY_EVENT = "ana-widget:open-with-query";

export function openAnaWithQuery(query: string) {
  window.dispatchEvent(new CustomEvent(ANA_QUERY_EVENT, { detail: { query } }));
}

type PanelDir = { v: "above" | "below"; h: "alignRight" | "alignLeft" };

export function SupportAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [anaTyping, setAnaTyping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dir, setDir] = useState<PanelDir>({ v: "above", h: "alignRight" });

  const listRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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

    try {
      /** Authenticated app shell: tenant comes from the Supabase session JWT on `functions.invoke` (not body fields). */
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: { message: text },
      });
      if (error) throw error;

      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: "Got it — I've routed your question to the right team. You'll see an update in your inbox shortly." },
      ]);
      setAnaTyping(false);
      setIsSubmitting(false);
      setTimeout(() => setOpen(false), 1500);
    } catch (err) {
      setAnaTyping(false);
      setIsSubmitting(false);
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to send message: ${msg}`);
    }
  }

  const panelPositionClass = [
    "absolute w-[320px]",
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
            setTimeout(() => { isDragging.current = false; }, 0);
          } else {
            isDragging.current = false;
          }
          if (open) computeDir();
        }}
        className="pointer-events-auto fixed bottom-24 right-6 z-[80]"
        style={{ touchAction: "none", x: dragX, y: dragY, overflow: "visible" }}
      >
        {/* Panel -- inside drag container, absolute positioned */}
        <AnimatePresence>
          {open && (
            <motion.div
              id="support-assistant-panel"
              className={`pointer-events-auto flex max-h-[min(70vh,380px)] flex-col px-3 py-3 ${OBSIDIAN_PANEL} ${panelPositionClass}`}
              role="dialog"
              aria-label="Ana support chat"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 28, mass: 0.8 }}
            >
              {/* Thread area */}
              <div
                ref={listRef}
                className="flex-1 space-y-4 overflow-y-auto overscroll-contain"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.length === 0 && !anaTyping && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                    <MessageCircle className="h-5 w-5 text-white/35" strokeWidth={1.5} />
                    <p className="text-[12px] text-white/40">Ask Ana anything</p>
                  </div>
                )}
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <p className="mb-1 text-[11px] font-semibold text-white/45">
                      {m.role === "user" ? "You" : "Ana"}
                    </p>
                    <p className="text-[12px] leading-[18px] text-white/90">{m.text}</p>
                  </motion.div>
                ))}
                {anaTyping && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                    <p className="mb-1 text-[11px] font-semibold text-white/45">Ana</p>
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/35" />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/35" style={{ animationDelay: "0.15s" }} />
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/35" style={{ animationDelay: "0.3s" }} />
                    </span>
                  </motion.div>
                )}
              </div>

              {/* Input area */}
              <div className="mt-3 shrink-0">
                <div className="rounded-[10px] border-0 bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
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
                    placeholder="Ask for follow-up changes"
                    disabled={isSubmitting}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[12px] text-white/95 placeholder:text-white/35 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex items-center justify-between px-2 pb-1.5">
                    <span className="text-[10px] text-white/40">Support · Ana</span>
                    <button
                      type="button"
                      onClick={submitQuestion}
                      disabled={isSubmitting || !question.trim()}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] transition hover:bg-white/25 disabled:opacity-30"
                    >
                      <Send className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Trigger — obsidian glass (KPI / priority / dock) */}
        <motion.button
          type="button"
          ref={btnRef}
          onClick={() => {
            if (isDragging.current) return;
            if (!open) computeDir();
            setOpen((o) => !o);
          }}
          className="relative cursor-grab border-0 bg-transparent p-0 active:cursor-grabbing"
          aria-expanded={open}
          aria-controls="support-assistant-panel"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          <div className={`flex items-center justify-center ${OBSIDIAN_TRIGGER}`}>
            <span className="flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-normal tracking-wide text-white">
              <AnimatePresence mode="wait" initial={false}>
                {open ? (
                  <motion.span
                    key="close"
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <X className="h-4 w-4 shrink-0" strokeWidth={1.35} aria-hidden />
                    Close
                  </motion.span>
                ) : (
                  <motion.span
                    key="open"
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <MessageCircle className="h-4 w-4 shrink-0 text-white/90" strokeWidth={1.35} aria-hidden />
                    Ana
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
        </motion.button>
      </motion.div>
    </>
  );
}
