import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardPen, Inbox, ListTodo } from "lucide-react";
import { openSpotlight } from "../../StudioSpotlight";
import { usePendingApprovals } from "../../../hooks/usePendingApprovals";
import { useUnfiledInbox } from "../../../hooks/useUnfiledInbox";
import { useTasks } from "../../../hooks/useTasks";
import { TiltCard } from "../../ui/TiltCard";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const SERIF = "'Playfair Display', Georgia, serif";

/** Same smoked crystal as Landing `Header` Early Access (`glass-shell` / `glass-inner` in index.css). */
function LandingGlassPill({
  children,
  className,
  innerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <span
      className={cn(
        "glass-shell inline-grid w-fit max-w-full rounded-[999px] align-middle shadow-[0_4px_10px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      <span
        className={cn(
          "glass-inner flex !h-auto min-h-[22px] w-max max-w-full items-center justify-center gap-1.5 px-2.5 py-0.5 text-[10px] font-normal tracking-wide text-white",
          innerClassName,
        )}
      >
        {children}
      </span>
    </span>
  );
}

const PULSE_MESSAGES = [
  "Ana drafted 2 replies for your review.",
  "You've had a busy week. Remember to rest your eyes.",
  "5 inquiries are pending. You are doing great.",
];

const GLASS_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.1)";
const CRYSTAL_BG = "rgba(255,255,255,0.03)";
const CRYSTAL_BORDER = "1px solid rgba(255,255,255,0.05)";
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

const NOISE_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

type ActionItem = {
  id: string;
  kind: "message" | "draft" | "task";
  label: string;
  detail: string;
  status: string;
  threadId?: string;
  weddingId?: string | null;
  taskId?: string;
  createdAt?: string;
};

function formatGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatDateLine(now = new Date()): string {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  return `${date}  •  14°C Belgrade`;
}

function formatTimeHHMM(now = new Date()): string {
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Point on quadratic Bézier P0 — P1 — P2 at t ∈ [0, 1]. */
function quadBezierPoint(
  t: number,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
  const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
  return { x, y };
}

/**
 * Position t follows the local clock through the day so the dot moves every second.
 * Brightness follows a day/night curve (soft at night, peak near local noon).
 */
function solarArcState(now: Date): { t: number; opacity: number; scale: number } {
  const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const t = secs / 86_400;
  const dayPhase = Math.sin(Math.PI * t);
  const opacity = 0.36 + 0.62 * dayPhase;
  const scale = 0.94 + 0.24 * dayPhase;
  return { t, opacity, scale };
}

function glowAlongArc(pathT: number): number {
  if (pathT <= 0.5) {
    return Math.pow(Math.sin(Math.PI * pathT), 2.05);
  }
  const u = (pathT - 0.5) / 0.5;
  return Math.pow(1 - u, 2.45);
}

/** Sized in `em` to match the metadata line; `now` from `useLiveClock` (1s) drives motion. */
function SolarArc({ now }: { now: Date }) {
  const uid = useId().replace(/:/g, "");
  const haloId = `${uid}-halo`;
  const coreId = `${uid}-core`;
  const bloomFilterId = `${uid}-bloom`;

  /* Wide gentle arc (large Δx, modest Δy). */
  const arcPath = "M 2 26 Q 42 -6 82 26";
  const p0: [number, number] = [2, 26];
  const p1: [number, number] = [42, -6];
  const p2: [number, number] = [82, 26];
  const { t, opacity, scale } = solarArcState(now);
  const { x, y } = quadBezierPoint(t, p0, p1, p2);
  const r = 5 * scale;
  const glow = glowAlongArc(t);

  /*
   * Slot size is in `em` against the metadata `text-[10px]` so it scales with the row.
   * viewBox is tight to the path + sun + glow — huge padding used to make `meet` shrink
   * the real arc inside a small em box; without that, the curve reads at full slot height.
   */
  const vb = { x: -4, y: 2, w: 92, h: 32 };

  return (
    <span className="inline-flex h-[2.15em] min-h-[2.15em] w-[8em] min-w-[8em] shrink-0 items-center overflow-visible align-middle [&>svg]:overflow-visible">
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width="100%"
        height="100%"
        fill="none"
        overflow="visible"
        preserveAspectRatio="xMidYMid meet"
        className="block max-h-full"
        aria-hidden
      >
        <defs>
          <radialGradient
            id={haloId}
            gradientUnits="userSpaceOnUse"
            cx={x}
            cy={y}
            r={r * 4.25}
          >
            <stop offset="0%" stopColor="#fffbeb" stopOpacity="0.65" />
            <stop offset="22%" stopColor="#fde68a" stopOpacity="0.38" />
            <stop offset="48%" stopColor="#fb923c" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
          <radialGradient
            id={coreId}
            gradientUnits="userSpaceOnUse"
            cx={x}
            cy={y - r * 0.12}
            r={r * 1.08}
          >
            <stop offset="0%" stopColor="#fffdf7" stopOpacity="1" />
            <stop offset="28%" stopColor="#fde68a" stopOpacity="1" />
            <stop offset="72%" stopColor="#fb923c" stopOpacity="1" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="1" />
          </radialGradient>
          <filter
            id={bloomFilterId}
            x="-120%"
            y="-120%"
            width="340%"
            height="340%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.35" result="blur" />
            <feComponentTransfer in="blur" result="soft">
              <feFuncA type="gamma" amplitude="1" exponent="1.25" offset="0" />
            </feComponentTransfer>
          </filter>
        </defs>
        <path
          d={arcPath}
          stroke="rgba(255, 255, 255, 0.26)"
          strokeWidth="1.35"
          strokeLinecap="round"
        />
        <circle cx={x} cy={y} r={r * 3.9} fill={`url(#${haloId})`} opacity={0.92 * glow} />
        <g opacity={0.78 * glow} filter={`url(#${bloomFilterId})`}>
          <circle cx={x} cy={y} r={r * 1.22} fill="#fcd34d" />
        </g>
        <circle cx={x} cy={y} r={r} fill={`url(#${coreId})`} opacity={opacity} />
      </svg>
    </span>
  );
}

function formatRelativeTime(iso?: string): string {
  if (!iso) return "just now";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fadingInk(iso?: string): { name: string; age: string; snippet: string } {
  if (!iso) return { name: "text-white", age: "text-white/50", snippet: "text-white/80" };
  const hrs = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hrs < 1) return { name: "text-white", age: "text-white/50", snippet: "text-white/80" };
  if (hrs < 4) return { name: "text-white/70", age: "text-white/40", snippet: "text-white/50" };
  return { name: "text-white/40", age: "text-white/25", snippet: "text-white/30" };
}

function useLiveClock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const now = new Date();
  return { dateLine: formatDateLine(now), timeHHMM: formatTimeHHMM(now), now };
}

function StudioPulse() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % PULSE_MESSAGES.length), 6_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="mt-4 h-6">
      <AnimatePresence mode="wait">
        <motion.p
          key={idx}
          className="text-sm italic text-white/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          {PULSE_MESSAGES[idx]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function SystemStream() {
  return (
    <div
      className="mt-6 w-full overflow-hidden"
      style={{
        maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
      }}
    >
      <p
        className="whitespace-nowrap font-mono text-[10px] text-white/25"
        style={{ animation: "marquee-scroll 60s linear infinite" }}
      >
        {"> Ana verified Invoice #1042 — auto-filed to S&J project   •   System health: nominal   •   3 threads resolved today   •   Draft queue clear   •   Calendar sync OK   •   "}
        {"> Ana verified Invoice #1042 — auto-filed to S&J project   •   System health: nominal   •   3 threads resolved today   •   Draft queue clear   •   Calendar sync OK   •   "}
      </p>
    </div>
  );
}

function CountUp({ target, duration = 600 }: { target: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setDisplay(0);
      return;
    }
    const start = performance.now();
    let raf: number;
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return <>{display}</>;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

function KpiCard({
  card,
  delay,
  compact = false,
  enrichment,
}: {
  card: { title: string; subtitle: string; count: number; icon: LucideIcon };
  delay: number;
  compact?: boolean;
  enrichment?: { metaTag: string };
}) {
  const isActive = card.count > 0;
  const showEnrichment = enrichment && isActive && !compact;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
    >
      <TiltCard>
        <div
          className={
            "glass-grain relative overflow-hidden rounded-xl " +
            (compact ? "p-5 " : "p-6 ") +
            (isActive ? "" : "opacity-40")
          }
          style={{
            background: CRYSTAL_BG,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: GLASS_SHADOW,
            border: CRYSTAL_BORDER,
          }}
        >
          <div className="relative z-10 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <card.icon className="h-3.5 w-3.5 text-white/40" strokeWidth={1.75} />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {card.title}
              </span>
            </div>
            {showEnrichment && (
              <LandingGlassPill innerClassName="text-white/90">{enrichment.metaTag}</LandingGlassPill>
            )}
          </div>

          <div className={"relative z-10 " + (showEnrichment ? "mt-4" : "mt-2.5")}>
            <span
              className={"font-normal leading-none tabular-nums text-white " + (compact ? "text-[28px]" : "text-[36px]")}
              style={{ fontFamily: SERIF }}
            >
              <CountUp target={card.count} />
            </span>
            <span className={"block text-[10px] tracking-wide text-white/50 " + (showEnrichment ? "mt-1.5" : "mt-2.5")}>
              {card.subtitle}
            </span>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

function ArchitecturalGrid() {
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[2] h-full w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      {/* Vertical split between col-5 and col-7 */}
      <line
        x1="42.5%"
        y1="0"
        x2="42.5%"
        y2="100%"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {/* Horizontal rule at KPI-card top */}
      <line
        x1="0"
        y1="280"
        x2="100%"
        y2="280"
        stroke="rgba(255,255,255,0.05)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function useIdle(timeout: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), timeout);
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeout);
    };
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("pointerdown", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("pointerdown", reset);
    };
  }, [timeout]);
  return idle;
}

const MOTES = Array.from({ length: 18 }, (_, i) => {
  const seed = (i * 7 + 3) % 17;
  return {
    size: 16 + (seed % 5) * 12,
    left: ((i * 13 + 5) % 100),
    top: ((i * 17 + 11) % 100),
    duration: 30 + (seed % 4) * 10,
    delay: (i * 1.7) % 12,
    dx: ((seed % 3) - 1) * 120,
    dy: ((seed % 2) === 0 ? -1 : 1) * (60 + seed * 8),
  };
});

function AtmosphericMotes() {
  return (
    <div className="sf-bg pointer-events-none fixed inset-0 z-[1] overflow-hidden">
      {MOTES.map((m, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white/[0.07] blur-2xl"
          style={{
            width: m.size,
            height: m.size,
            left: `${m.left}%`,
            top: `${m.top}%`,
            animation: `mote-drift-${i % 4} ${m.duration}s ease-in-out ${m.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

function MagneticRow({ children, className }: { children: React.ReactNode; className?: string }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (overlayRef.current) {
      overlayRef.current.style.opacity = "1";
      overlayRef.current.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.08), transparent 40%)`;
    }
  }, []);
  const handleLeave = useCallback(() => {
    if (overlayRef.current) overlayRef.current.style.opacity = "0";
  }, []);
  return (
    <div className={"relative z-0 hover:z-10 " + (className ?? "")} onMouseMove={handleMove} onMouseLeave={handleLeave}>
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200"
      />
      {children}
    </div>
  );
}

export function ZenLobby() {
  const navigate = useNavigate();
  const { drafts } = usePendingApprovals();
  const { unfiledThreads } = useUnfiledInbox();
  const { tasks } = useTasks();
  const { dateLine, timeHHMM, now } = useLiveClock();
  const isIdle = useIdle(IDLE_TIMEOUT_MS);

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    for (const t of unfiledThreads) {
      items.push({
        id: `msg-${t.id}`,
        kind: "message",
        label: t.title,
        detail: t.sender || "Unknown sender",
        status: "Unfiled",
        threadId: t.id,
        createdAt: (t as Record<string, unknown>).created_at as string | undefined,
      });
    }

    for (const d of drafts) {
      items.push({
        id: `dft-${d.id}`,
        kind: "draft",
        label: d.thread_title,
        detail: d.couple_names,
        status: "Pending Approval",
        threadId: d.id,
        weddingId: d.wedding_id,
        createdAt: (d as Record<string, unknown>).created_at as string | undefined,
      });
    }

    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    for (const t of tasks) {
      const due = new Date(t.due_date);
      if (due > eod) continue;
      items.push({
        id: `tsk-${t.id}`,
        kind: "task",
        label: t.title,
        detail: t.couple_names ?? "",
        status: due.toDateString() === new Date().toDateString() ? "Due Today" : "Overdue",
        taskId: t.id,
        weddingId: t.wedding_id,
        createdAt: (t as Record<string, unknown>).created_at as string | undefined,
      });
    }

    return items;
  }, [unfiledThreads, drafts, tasks]);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const tasksDueCount = tasks.filter((t) => new Date(t.due_date) <= endOfToday).length;

  const kpiCards: { title: string; subtitle: string; count: number; icon: LucideIcon }[] = [
    { title: "Inquiries", subtitle: "messages", count: unfiledThreads.length, icon: Inbox },
    { title: "Drafts", subtitle: "awaiting review", count: drafts.length, icon: ClipboardPen },
    { title: "Tasks", subtitle: "due today", count: tasksDueCount, icon: ListTodo },
  ];

  return (
    <div
      className={`relative flex h-full w-full overflow-y-auto${isIdle ? " soft-focus" : ""}`}
      onDoubleClick={openSpotlight}
    >
      <style>{`
        .soft-focus .sf-bg {
          filter: blur(20px);
          transition: filter 2s ease, opacity 2s ease;
        }
        .soft-focus .sf-card {
          filter: blur(12px);
          opacity: 0.2;
          pointer-events: none;
          transition: filter 1.5s ease, opacity 1.5s ease;
        }
        .soft-focus .sf-hero {
          filter: drop-shadow(0 0 20px rgba(255,255,255,0.2));
          transition: filter 1s ease;
        }
        .sf-bg, .sf-card, .sf-hero {
          transition: filter 0.4s ease, opacity 0.4s ease;
        }
        @keyframes foil-sweep {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes waiting-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.85); }
        }
        @keyframes marquee-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .glass-grain::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: ${NOISE_SVG};
          background-size: 128px 128px;
          opacity: 0.04;
          mix-blend-mode: overlay;
          pointer-events: none;
          z-index: 1;
        }
        .glass-grain::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255,100,150,0.15), rgba(100,200,255,0.15), rgba(255,200,100,0.15));
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          -webkit-mask-composite: xor;
          padding: 1px;
          opacity: 0;
          transition: opacity 0.5s ease;
          pointer-events: none;
          z-index: 2;
        }
        .glass-grain:hover::after {
          opacity: 1;
        }
        @keyframes mote-drift-0 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(80px, -100px); }
        }
        @keyframes mote-drift-1 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-120px, 70px); }
        }
        @keyframes mote-drift-2 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(60px, 90px); }
        }
        @keyframes mote-drift-3 {
          0% { transform: translate(0, 0); }
          100% { transform: translate(-90px, -60px); }
        }
      `}</style>

      <AtmosphericMotes />

      <div className="relative z-10 mx-auto mt-16 mb-32 w-full max-w-[90rem] px-8">
        {/* ── Asymmetric Grid ── */}
        <div className="grid grid-cols-12 gap-16 lg:gap-24">

          {/* ── Left Column: Header + KPI ── */}
          <div className="col-span-12 lg:col-span-5">
            {/* Metadata */}
            <motion.p
              className="flex items-center gap-2 overflow-visible text-[10px] font-medium uppercase leading-none tracking-[0.2em] text-white/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {dateLine}
              <span className="mx-0.5">•</span>
              <SolarArc now={now} />
              <span className="normal-case tracking-wide">{timeHHMM}</span>
            </motion.p>

            {/* Greeting */}
            <motion.div
              className="sf-hero mt-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05, ease: "easeOut" }}
            >
              <h1 style={{ fontFamily: SERIF }}>
                <span className="block text-[56px] font-normal leading-[1.05] tracking-tight text-white drop-shadow-sm">
                  {formatGreeting()},
                </span>
                <span
                  className="block text-[64px] font-semibold italic leading-[1.05] tracking-tight drop-shadow-sm"
                  style={{
                    backgroundImage: "linear-gradient(135deg, #ffffff 0%, #6b7280 45%, #9ca3af 55%, #ffffff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Elena
                </span>
              </h1>
              <StudioPulse />
            </motion.div>

            {/* KPI Cluster */}
            <div className="sf-card mt-10">
              <KpiCard
                card={kpiCards[0]}
                delay={0.15}
                enrichment={{
                  metaTag: `+${Math.max(unfiledThreads.length, 1)} since yesterday`,
                }}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <KpiCard card={kpiCards[1]} delay={0.25} compact />
                <KpiCard card={kpiCards[2]} delay={0.3} compact />
              </div>
            </div>

            {/* System Stream */}
            <SystemStream />
          </div>

          {/* ── Right Column: Action Feed (baseline-aligned to KPI) ── */}
          <div className="sf-card col-span-12 lg:col-span-7 lg:pt-[178px]">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
            >
              {actionItems.length > 0 && (
                <p className="mb-4 pl-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  Priority Actions
                </p>
              )}

              <div className="flex flex-col">
                {actionItems.map((item, i) => {
                  const initials = getInitials(item.detail || item.label);
                  const age = formatRelativeTime(item.createdAt);
                  const ink = fadingInk(item.createdAt);
                  const isLast = i === actionItems.length - 1;
                  return (
                    <MagneticRow key={item.id}>
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, delay: 0.4 + i * 0.06, ease: "easeOut" }}
                        onClick={() => {
                          if (item.kind === "message" && item.threadId) {
                            navigate(`/inbox?threadId=${item.threadId}`);
                          } else if (item.kind === "draft" && item.threadId) {
                            navigate(`/inbox?threadId=${item.threadId}&action=review_draft`);
                          } else if (item.kind === "task" && item.weddingId) {
                            navigate(`/pipeline/${item.weddingId}?openTask=${item.taskId}`);
                          } else if (item.kind === "task") {
                            navigate("/pipeline");
                          }
                        }}
                        className={`relative flex w-full cursor-pointer items-center gap-4 rounded-lg py-3.5 pr-3 pl-4 text-left transition-colors duration-200 hover:bg-white/[0.03]${isLast ? "" : " border-b border-white/[0.05]"}`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[13px] font-medium ${ink.name}`}>
                            {item.detail || "Unknown"}
                            <span className={`ml-2 text-[11px] font-normal ${ink.age}`}>
                              • {age}
                            </span>
                          </p>
                          <p className={`mt-0.5 truncate text-[12px] ${ink.snippet}`}>
                            {item.label}
                          </p>
                        </div>
                        <LandingGlassPill className="shrink-0" innerClassName="gap-1.5 font-normal text-white/90">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400"
                            style={{ animation: "waiting-dot 2s ease-in-out infinite" }}
                          />
                          {item.status}
                        </LandingGlassPill>
                      </motion.button>
                    </MagneticRow>
                  );
                })}
              </div>

              {actionItems.length === 0 && (
                <p className="pt-4 text-[13px] text-white/30">No pending actions</p>
              )}
            </motion.div>
          </div>
        </div>

      </div>
    </div>
  );
}
