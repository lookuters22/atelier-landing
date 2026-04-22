import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  deriveOperatorAnaFocusFromPathname,
  operatorAnaFocusBadgeLabel,
} from "../lib/operatorStudioAssistantFocus.ts";
import {
  buildOperatorAnaWidgetConversation,
  extractOperatorAnaWidgetCompletedTurns,
} from "../lib/operatorAnaWidgetConversation.ts";
import type { OperatorAnaWidgetFocusSnapshot } from "../lib/operatorAnaWidgetConversationBounds.ts";
import {
  buildOperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantAssistantDisplay,
  type OperatorStudioAssistantInvokePayload,
} from "../lib/operatorStudioAssistantWidgetResult.ts";
import { logAnaStreamLine, operatorAnaStreamDebugEnabled } from "../lib/operatorAnaStreamDebug.ts";
import {
  computeRevealNewLength,
  type RevealState,
  shouldBypassPacedDrain,
} from "../lib/operatorAnaStreamSmoothReveal.ts";
import { consumeOperatorAssistantSseStream } from "../lib/operatorStudioAssistantStreamClient.ts";
import { getSupabaseEdgeFunctionErrorMessage } from "../lib/supabaseEdgeFunctionErrorMessage.ts";
import {
  addConsumedProposalKey,
  caseExceptionProposalKey,
  isProposalKeyConsumed,
  memoryProposalKey,
  ruleProposalKey,
  taskProposalKey,
} from "../lib/operatorAnaProposalConsumedState.ts";
import type {
  OperatorAssistantProposedActionAuthorizedCaseException,
  OperatorAssistantProposedActionMemoryNote,
  OperatorAssistantProposedActionPlaybookRuleCandidate,
  OperatorAssistantProposedActionTask,
} from "../types/operatorAssistantProposedAction.types.ts";
import type { OperatorAnaCarryForwardClientState } from "../types/operatorAnaCarryForward.types.ts";

type ChatLine =
  | { id: string; role: "user"; text: string; focusSnapshot: OperatorAnaWidgetFocusSnapshot }
  | {
      id: string;
      role: "assistant";
      kind: "in_flight";
      streamingText: string;
      focusSnapshot: OperatorAnaWidgetFocusSnapshot;
    }
  | { id: string; role: "assistant"; display: OperatorStudioAssistantAssistantDisplay; focusSnapshot: OperatorAnaWidgetFocusSnapshot };

function operatorAssistantStreamingV1Enabled(): boolean {
  return import.meta.env.VITE_OPERATOR_ASSISTANT_STREAMING_V1 === "true";
}

function isAssistantInFlightLine(
  m: ChatLine,
): m is { id: string; role: "assistant"; kind: "in_flight"; streamingText: string; focusSnapshot: OperatorAnaWidgetFocusSnapshot } {
  return m.role === "assistant" && "kind" in m && m.kind === "in_flight";
}

function isUserAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

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
    <details className="mt-2 rounded-md border border-white/15 bg-white/[0.07] px-2 py-1.5 text-left">
      <summary className="cursor-pointer list-none font-['SaansMono',ui-monospace,monospace] text-[9px] uppercase tracking-wide text-white/60 outline-none [&::-webkit-details-marker]:hidden">
        Retrieval (dev)
      </summary>
      <dl className="mt-1.5 space-y-1 font-['SaansMono',ui-monospace,monospace] text-[9px] leading-snug text-white/65">
        <div>
          <dt className="inline text-white/50">Scopes</dt>
          <dd className="inline pl-1 break-all">{scopes}</dd>
        </div>
        <div>
          <dt className="inline text-white/50">Memories</dt>
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
  const [confirmingProposalKey, setConfirmingProposalKey] = useState<string | null>(null);
  /** Per assistant message id: proposal keys that already succeeded (no duplicate confirms). */
  const [consumedProposalKeysByMessageId, setConsumedProposalKeysByMessageId] = useState<Record<string, string[]>>(
    {},
  );
  const [dir, setDir] = useState<PanelDir>({ v: "above", h: "alignRight" });

  const listRef = useRef<HTMLDivElement>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  /** Cleared when route focus changes or panel closes — matches server carry-forward lifecycle. */
  const pathFocusKeyRef = useRef<string>("");
  const carryForwardRef = useRef<OperatorAnaCarryForwardClientState | null>(null);
  /** Bumps to invalidate in-flight `setIsSubmitting` work when a new submit or unmount/close cancels. */
  const submitGenRef = useRef(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const revealStateRef = useRef<RevealState | null>(null);
  const cancelPacedReveal = useCallback(() => {
    const st = revealStateRef.current;
    if (st?.rafId != null) {
      cancelAnimationFrame(st.rafId);
    }
    revealStateRef.current = null;
  }, []);

  const pathFocus = deriveOperatorAnaFocusFromPathname(pathname);
  const pathFocusKey = `${pathFocus.weddingId ?? ""}|${pathFocus.personId ?? ""}`;

  useEffect(() => {
    if (pathFocusKeyRef.current === "") {
      pathFocusKeyRef.current = pathFocusKey;
      return;
    }
    if (pathFocusKeyRef.current !== pathFocusKey) {
      carryForwardRef.current = null;
      pathFocusKeyRef.current = pathFocusKey;
    }
  }, [pathFocusKey]);

  useEffect(() => {
    if (!open) {
      submitGenRef.current += 1;
      streamAbortRef.current?.abort();
      cancelPacedReveal();
      setIsSubmitting(false);
      setAnaTyping(false);
      setMessages((m) => m.filter((x) => !isAssistantInFlightLine(x)));
      carryForwardRef.current = null;
    }
  }, [open, cancelPacedReveal]);

  useEffect(() => {
    return () => {
      submitGenRef.current += 1;
      streamAbortRef.current?.abort();
      cancelPacedReveal();
    };
  }, [cancelPacedReveal]);

  const focusLabel = operatorAnaFocusBadgeLabel(pathFocus);

  async function confirmPlaybookRuleProposal(assistantMessageId: string, p: OperatorAssistantProposedActionPlaybookRuleCandidate) {
    const key = ruleProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-playbook-rule-candidate", {
        body: {
          proposedActionKey: p.proposedActionKey,
          topic: p.topic,
          proposedInstruction: p.proposedInstruction,
          proposedDecisionMode: p.proposedDecisionMode,
          proposedScope: p.proposedScope,
          proposedChannel: p.proposedScope === "channel" ? p.proposedChannel : null,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const cid = (data as { candidateId?: string } | null)?.candidateId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(cid ? `Rule candidate created. Review in your playbook candidates list. ID: ${cid}` : "Candidate created.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not create candidate: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmTaskProposal(assistantMessageId: string, p: OperatorAssistantProposedActionTask) {
    const key = taskProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-task", {
        body: {
          title: p.title,
          dueDate: p.dueDate,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const tid = (data as { taskId?: string } | null)?.taskId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(tid ? `Task created. ID: ${tid}` : "Task created.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not create task: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmMemoryNoteProposal(assistantMessageId: string, p: OperatorAssistantProposedActionMemoryNote) {
    const key = memoryProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-memory", {
        body: {
          memoryScope: p.memoryScope,
          title: p.title,
          summary: p.summary,
          fullContent: p.fullContent,
          weddingId: p.weddingId ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const mid = (data as { memoryId?: string } | null)?.memoryId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(mid ? `Memory saved. ID: ${mid}` : "Memory saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not save memory: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

  async function confirmAuthorizedCaseExceptionProposal(
    assistantMessageId: string,
    p: OperatorAssistantProposedActionAuthorizedCaseException,
  ) {
    const key = caseExceptionProposalKey(p);
    if (confirmingProposalKey || isProposalKeyConsumed(consumedProposalKeysByMessageId, assistantMessageId, key)) {
      return;
    }
    setConfirmingProposalKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("insert-operator-assistant-authorized-case-exception", {
        body: {
          overridesActionKey: p.overridesActionKey,
          overridePayload: p.overridePayload,
          weddingId: p.weddingId,
          clientThreadId: p.clientThreadId ?? null,
          targetPlaybookRuleId: p.targetPlaybookRuleId ?? null,
          effectiveUntil: p.effectiveUntil ?? null,
          notes: p.notes ?? null,
        },
      });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }
      const eid = (data as { exceptionId?: string } | null)?.exceptionId;
      setConsumedProposalKeysByMessageId((prev) => addConsumedProposalKey(prev, assistantMessageId, key));
      alert(eid ? `Case exception saved. ID: ${eid}` : "Case exception saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Could not save case exception: ${msg}`);
    } finally {
      setConfirmingProposalKey(null);
    }
  }

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
    if (!text) return;
    if (!operatorAssistantStreamingV1Enabled() && isSubmitting) return;

    const myGen = ++submitGenRef.current;
    const endSubmitting = () => {
      if (submitGenRef.current === myGen) {
        setIsSubmitting(false);
        setAnaTyping(false);
      }
    };

    const currentFocus: OperatorAnaWidgetFocusSnapshot = {
      weddingId: pathFocus.weddingId ?? null,
      personId: null,
    };
    const priorTurns = extractOperatorAnaWidgetCompletedTurns(messages);
    const conversation = buildOperatorAnaWidgetConversation(priorTurns, currentFocus);

    const userLine: ChatLine = { id: nextId(), role: "user", text, focusSnapshot: currentFocus };
    setQuestion("");

    const { weddingId: focusedWeddingId } = pathFocus;
    const requestBody: Record<string, unknown> = {
      queryText: text,
      focusedWeddingId: focusedWeddingId ?? null,
      focusedPersonId: null,
      ...(conversation.length > 0 ? { conversation } : {}),
      ...(carryForwardRef.current ? { carryForward: carryForwardRef.current } : {}),
    };

    if (operatorAssistantStreamingV1Enabled()) {
      logAnaStreamLine("streaming branch entered");
      cancelPacedReveal();
      streamAbortRef.current?.abort();
      const ac = new AbortController();
      streamAbortRef.current = ac;
      const inFlightId = nextId();
      setIsSubmitting(true);
      setAnaTyping(false);
      setMessages((m) => {
        const withoutInFlight = m.filter((x) => !isAssistantInFlightLine(x));
        return [
          ...withoutInFlight,
          userLine,
          {
            id: inFlightId,
            role: "assistant" as const,
            kind: "in_flight" as const,
            streamingText: "",
            focusSnapshot: currentFocus,
          },
        ];
      });
      let sawDone = false;
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (!session?.access_token) {
          throw new Error("Not signed in");
        }
        const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
        const url = `${String(base).replace(/\/$/, "")}/functions/v1/operator-studio-assistant`;
        const streamDebug = operatorAnaStreamDebugEnabled();
        const tStream0 = performance.now();
        if (streamDebug) {
          logAnaStreamLine("start");
        }
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify(requestBody),
          signal: ac.signal,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
        });
        if (streamDebug) {
          logAnaStreamLine(`response ${res.status} at ${Math.round(performance.now() - tStream0)}ms`);
        }
        if (!res.ok) {
          const t = await res.text();
          let detail = t || res.statusText;
          try {
            const j = JSON.parse(t) as { error?: string };
            if (typeof j.error === "string" && j.error) detail = j.error;
          } catch {
            /* keep detail */
          }
          throw new Error(detail);
        }
        const finalizePacedReveal = () => {
          const st0 = revealStateRef.current;
          if (st0?.rafId != null) {
            cancelAnimationFrame(st0.rafId);
            st0.rafId = null;
          }
          const pending = st0?.pendingFinal;
          if (!st0 || !pending) {
            revealStateRef.current = null;
            return;
          }
          logAnaStreamLine(
            `finalize: displayedAtSwap=${st0.displayedLen} receivedAtSwap=${st0.received.length}`,
          );
          setMessages((m) =>
            m.map((x) =>
              x.id === st0.inFlightId && isAssistantInFlightLine(x)
                ? {
                    id: st0.inFlightId,
                    role: "assistant" as const,
                    display: pending.display,
                    focusSnapshot: pending.focusSnapshot,
                  }
                : x,
            ),
          );
          revealStateRef.current = null;
        };

        const waitPacedDrained = () =>
          new Promise<void>((resolve) => {
            const run = () => {
              if (revealStateRef.current == null) {
                resolve();
                return;
              }
              requestAnimationFrame(run);
            };
            run();
          });

        const tick = (ts: number) => {
          const st = revealStateRef.current;
          if (!st || st.inFlightId !== inFlightId) return;
          const { newDisplayedLen, lastTs: nextLast } = computeRevealNewLength(
            {
              receivedLen: st.received.length,
              displayedLen: st.displayedLen,
              receivedEnded: st.receivedEnded,
              lastTs: st.lastTs,
            },
            ts,
          );
          st.lastTs = nextLast;
          if (newDisplayedLen !== st.displayedLen) {
            st.displayedLen = newDisplayedLen;
            setMessages((prev) =>
              prev.map((x) =>
                x.id === inFlightId && isAssistantInFlightLine(x)
                  ? { ...x, streamingText: st.received.slice(0, st.displayedLen) }
                  : x,
              ),
            );
          }
          if (streamDebug) {
            logAnaStreamLine(
              `tick: displayed=${st.displayedLen} received=${st.received.length} ended=${String(
                st.receivedEnded,
              )} at +${Math.round(performance.now() - tStream0)}ms`,
            );
          }
          if (st.receivedEnded && st.displayedLen >= st.received.length) {
            st.rafId = null;
            finalizePacedReveal();
            return;
          }
          if (st.displayedLen < st.received.length) {
            st.rafId = requestAnimationFrame(tick);
            return;
          }
          st.rafId = null;
        };

        let streamTokenCount = 0;
        for await (const ev of consumeOperatorAssistantSseStream(res, ac.signal)) {
          if (ev.type === "token") {
            const d = (ev.data as { delta?: string } | null)?.delta;
            if (typeof d === "string" && d.length > 0) {
              streamTokenCount += 1;
              if (streamDebug) {
                const ms = Math.round(performance.now() - tStream0);
                if (streamTokenCount === 1) {
                  logAnaStreamLine(`first non-empty token at ${ms}ms`);
                }
                logAnaStreamLine(`token #${streamTokenCount} (+${d.length} chars) at ${ms}ms`);
              }
              const st0 = (revealStateRef.current ??= {
                inFlightId,
                received: "",
                displayedLen: 0,
                lastTs: performance.now(),
                rafId: null,
                receivedEnded: false,
                pendingFinal: null,
              });
              st0.received += d;
              if (st0.rafId == null) {
                st0.rafId = requestAnimationFrame(tick);
              }
            }
          } else if (ev.type === "done") {
            if (streamDebug) {
              const ms = Math.round(performance.now() - tStream0);
              logAnaStreamLine(
                `done at ${ms}ms after ${streamTokenCount} non-empty token(s)` +
                  (streamTokenCount === 0 ? " (zero tokens before done)" : ""),
              );
            }
            sawDone = true;
            const payload = ev.data as OperatorStudioAssistantInvokePayload | null;
            const nextCf = payload?.carryForward;
            carryForwardRef.current =
              nextCf != null && typeof nextCf === "object" && "emittedAtEpochMs" in (nextCf as object)
                ? (nextCf as OperatorAnaCarryForwardClientState)
                : null;
            const display = buildOperatorStudioAssistantAssistantDisplay(payload, { devMode: import.meta.env.DEV });
            const st = revealStateRef.current;
            if (!st) {
              setMessages((m) =>
                m.map((x) =>
                  x.id === inFlightId && isAssistantInFlightLine(x)
                    ? { id: inFlightId, role: "assistant" as const, display, focusSnapshot: currentFocus }
                    : x,
                ),
              );
            } else {
              st.pendingFinal = { display, focusSnapshot: currentFocus };
              st.receivedEnded = true;
              if (shouldBypassPacedDrain(st.received.length)) {
                if (st.rafId != null) {
                  cancelAnimationFrame(st.rafId);
                }
                st.rafId = null;
                finalizePacedReveal();
              } else if (st.rafId == null) {
                st.rafId = requestAnimationFrame(tick);
              }
            }
          } else if (ev.type === "error") {
            if (streamDebug) {
              logAnaStreamLine(
                `error event after ${streamTokenCount} token(s) at ${Math.round(performance.now() - tStream0)}ms`,
              );
            }
            const m0 = (ev.data as { message?: string } | null)?.message;
            throw new Error(typeof m0 === "string" && m0.length > 0 ? m0 : "Stream error");
          }
        }
        if (!sawDone) {
          cancelPacedReveal();
          if (streamDebug) {
            logAnaStreamLine(
              `stream ended before done after ${streamTokenCount} token(s) at ${Math.round(performance.now() - tStream0)}ms`,
            );
          }
          throw new Error("Stream ended before done");
        }
        await waitPacedDrained();
      } catch (err) {
        if (isUserAbortError(err)) {
          cancelPacedReveal();
          return;
        }
        cancelPacedReveal();
        setMessages((m) => m.filter((x) => x.id !== inFlightId));
        const msg = err instanceof Error ? err.message : "Unknown error";
        alert(`Failed to send message: ${msg}`);
      } finally {
        if (streamAbortRef.current === ac) streamAbortRef.current = null;
        endSubmitting();
      }
      return;
    }

    setMessages((m) => [...m, userLine]);
    setIsSubmitting(true);
    setAnaTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke("operator-studio-assistant", { body: requestBody });
      if (error) {
        const detail = await getSupabaseEdgeFunctionErrorMessage(error, data);
        throw new Error(detail);
      }

      const payload = data as OperatorStudioAssistantInvokePayload | null;
      const nextCf = payload?.carryForward;
      carryForwardRef.current =
        nextCf != null && typeof nextCf === "object" && "emittedAtEpochMs" in (nextCf as object)
          ? (nextCf as OperatorAnaCarryForwardClientState)
          : null;

      const display = buildOperatorStudioAssistantAssistantDisplay(payload, { devMode: import.meta.env.DEV });

      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "assistant",
          display,
          focusSnapshot: currentFocus,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Failed to send message: ${msg}`);
    } finally {
      endSubmitting();
    }
  }

  const panelPositionClass = [
    "absolute w-[min(100vw-2rem,320px)]",
    dir.v === "above" ? "bottom-full mb-2" : "top-full mt-2",
    dir.h === "alignRight" ? "right-0" : "left-0",
  ].join(" ");

  /** Streaming path allows a new send to cancel the prior turn; legacy path keeps the old lock. */
  const lockComposerWhileSubmitting = isSubmitting && !operatorAssistantStreamingV1Enabled();

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
                  className="mb-2 flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.08] px-2 py-1.5"
                  role="status"
                  aria-label={focusLabel}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.45)]"
                    aria-hidden
                  />
                  <span className="font-['Saans',ui-sans-serif] text-[11px] leading-tight text-white/90">
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
                  <div className="flex h-full min-h-[100px] flex-col items-center justify-center py-6">
                    <span className="ana-badge-logo" aria-hidden>
                      a
                    </span>
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
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">{m.text}</p>
                    ) : isAssistantInFlightLine(m) ? (
                      m.streamingText.length === 0 ? (
                        <span className="inline-flex gap-1" aria-label="Ana is typing">
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
                      ) : (
                        <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">{m.streamingText}</p>
                      )
                    ) : m.display.kind === "contract_violation" ? (
                      <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-amber-200">
                        {m.display.mainText}
                      </p>
                    ) : (
                      <div>
                        <p className="whitespace-pre-wrap text-[12px] leading-[1.45] text-white/[0.96]">
                          {m.display.mainText}
                        </p>
                        <p className="mt-2 border-l border-white/25 pl-2 font-['Saans',ui-sans-serif] text-[10px] leading-relaxed text-white/60">
                          {m.display.operatorRibbon}
                        </p>
                        {m.display.playbookRuleProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.playbookRuleProposals.map((p) => {
                              const pk = ruleProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-amber-400/25 bg-amber-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                                    Proposed playbook rule
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.topic}</p>
                                  <p className="mt-0.5 line-clamp-4 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/70">
                                    {p.proposedInstruction}
                                  </p>
                                  <p className="mt-1.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    {p.proposedActionKey} · {p.proposedDecisionMode} · {p.proposedScope}
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Rule candidate created.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmPlaybookRuleProposal(m.id, p)}
                                    className="mt-2 rounded border border-amber-400/40 bg-amber-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-amber-100 hover:bg-amber-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Created" : busy ? "Creating…" : "Create rule candidate (review next)"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.taskProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.taskProposals.map((p) => {
                              const pk = taskProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-sky-400/25 bg-sky-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
                                    Proposed task
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.title}</p>
                                  <p className="mt-0.5 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/55">
                                    Due {p.dueDate}
                                    {p.weddingId ? ` · wedding ${p.weddingId}` : ""}
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">Task created.</p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmTaskProposal(m.id, p)}
                                    className="mt-2 rounded border border-sky-400/40 bg-sky-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-sky-100 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Created" : busy ? "Creating…" : "Create task"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.memoryNoteProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.memoryNoteProposals.map((p) => {
                              const pk = memoryProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-violet-400/25 bg-violet-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
                                    Proposed memory
                                  </p>
                                  <p className="mt-1 font-['Saans',ui-sans-serif] text-[11px] text-white/90">{p.title}</p>
                                  <p className="mt-0.5 line-clamp-3 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/70">
                                    {p.summary}
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    {p.memoryScope}
                                    {p.weddingId ? ` · ${p.weddingId}` : ""}
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">Memory saved.</p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmMemoryNoteProposal(m.id, p)}
                                    className="mt-2 rounded border border-violet-400/40 bg-violet-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-violet-100 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Saved" : busy ? "Saving…" : "Save memory"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {m.display.authorizedCaseExceptionProposals.length > 0 && (
                          <ul className="mt-2 space-y-2">
                            {m.display.authorizedCaseExceptionProposals.map((p) => {
                              const pk = caseExceptionProposalKey(p);
                              const busy = confirmingProposalKey === pk;
                              const consumed = isProposalKeyConsumed(consumedProposalKeysByMessageId, m.id, pk);
                              return (
                                <li
                                  key={pk}
                                  className="rounded-md border border-fuchsia-400/25 bg-fuchsia-500/[0.07] px-2.5 py-2 text-left"
                                >
                                  <p className="font-['Saans',ui-sans-serif] text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200/90">
                                    Proposed case exception
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[10px] text-white/80">
                                    {p.overridesActionKey}
                                  </p>
                                  <p className="mt-0.5 font-['Saans',ui-sans-serif] text-[10px] leading-snug text-white/65">
                                    One-off override for this project (not a global playbook change).
                                  </p>
                                  <p className="mt-1 font-['SaansMono',ui-monospace,monospace] text-[9px] text-white/50">
                                    wedding {p.weddingId}
                                    {p.clientThreadId ? ` · thread ${p.clientThreadId}` : ""}
                                  </p>
                                  {consumed && (
                                    <p className="mt-1.5 font-['Saans',ui-sans-serif] text-[10px] text-emerald-200/90">
                                      Exception saved.
                                    </p>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || consumed}
                                    onClick={() => void confirmAuthorizedCaseExceptionProposal(m.id, p)}
                                    className="mt-2 rounded border border-fuchsia-400/40 bg-fuchsia-500/20 px-2 py-1 font-['Saans',ui-sans-serif] text-[10px] text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {consumed ? "Saved" : busy ? "Saving…" : "Save case exception"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
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
                <div className="ana-widget-input-well focus-within:border-white/25">
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
                    placeholder="Ask me anything..."
                    disabled={lockComposerWhileSubmitting}
                    className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 font-['Saans',ui-sans-serif] text-[12px] text-white/[0.96] placeholder:text-white/45 focus:outline-none disabled:opacity-60"
                  />
                  <div className="flex items-center justify-end px-2 pb-1.5">
                    <button
                      type="button"
                      onClick={() => submitQuestion()}
                      disabled={lockComposerWhileSubmitting || !question.trim()}
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
