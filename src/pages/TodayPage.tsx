import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, CalendarClock, ClipboardPen, FlaskConical, Inbox, ListTodo, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useTodayMetrics } from "../hooks/useTodayMetrics";
import { useTasks } from "../hooks/useTasks";
import { useUpcomingWeddings } from "../hooks/useUpcomingWeddings";
import { handleGlowMove, handleGlowLeave } from "../lib/glowEffect";
import { MotionPage, MotionSection } from "../components/motion-primitives";

const MotionLink = motion.create(Link);

type AttentionItem = {
  title: string;
  count: number;
  hint: string;
  to: string;
  Icon: LucideIcon;
  iconGradient: string;
};

function buildAttention(unfiledCount: number, pendingDraftsCount: number, tasksDueCount: number): AttentionItem[] {
  return [
    {
      title: "Unfiled messages",
      count: unfiledCount,
      hint: "Link threads to the right wedding to keep timelines clean.",
      to: "/inbox?filter=unfiled",
      Icon: Inbox,
      iconGradient: "linear-gradient(135deg, #ff6259 0%, #d63340 100%)",
    },
    {
      title: "Drafts awaiting approval",
      count: pendingDraftsCount,
      hint: "Review tone before anything reaches a planner or couple.",
      to: "/approvals",
      Icon: ClipboardPen,
      iconGradient: "linear-gradient(135deg, #38bdf8 0%, #0169cc 100%)",
    },
    {
      title: "Tasks due today",
      count: tasksDueCount,
      hint: "Questionnaire reminder for Villa Cetinale.",
      to: "/tasks",
      Icon: ListTodo,
      iconGradient: "linear-gradient(135deg, #34d399 0%, #059669 100%)",
    },
  ];
}

function formatWeddingDate(iso: string, location: string): string {
  const d = new Date(iso);
  const formatted = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${formatted} \u00B7 ${location}`;
}

function formatStageLabel(stage: string): string {
  return stage
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function TodayPage() {
  const { photographerId } = useAuth();
  const { unfiledCount, pendingDraftsCount, featuredWedding } = useTodayMetrics();
  const { tasks } = useTasks();
  const { weddings: upcomingWeddings } = useUpcomingWeddings(photographerId ?? "", 4);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function fireTestLead() {
    try {
      setIsSimulating(true);
      setSimResult(null);
      /** Tenant for webhook-web comes from the Supabase session JWT on this invoke — not from body fields. */
      const { error } = await supabase.functions.invoke("webhook-web", {
        body: {
          source: "test_button",
          lead: {
            name: "Sarah & James",
            email: "sarah.test@example.com",
            event_date: "2026-09-15",
            message:
              "Hi! We are getting married in Lake Como and absolutely love your editorial style. Are you available for our dates?",
          },
        },
      });
      if (error) throw error;
      setSimResult({ ok: true, message: "Lead sent \u2014 check Inbox for the AI pipeline result." });
    } catch (err: unknown) {
      setSimResult({ ok: false, message: err instanceof Error ? err.message : "Failed to send test lead." });
    } finally {
      setIsSimulating(false);
    }
  }

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const tasksDueCount = tasks.filter((t) => new Date(t.due_date) <= endOfToday).length;

  const attention = buildAttention(unfiledCount, pendingDraftsCount, tasksDueCount);

  return (
    <MotionPage className="space-y-8">
      <MotionSection className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-small text-ink-muted">Wednesday, 25 March</p>
          <h1 className="shiny-heading mt-1 type-display-m">
            Good morning, Elena
          </h1>
          <p className="mt-2 max-w-xl type-small text-ink-muted">
            Your command center for inquiries, approvals, and what is next in the calendar—without opening your inbox blind.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {featuredWedding ? (
            <MotionLink
              to={`/wedding/${featuredWedding.id}`}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="card-lift inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 type-small text-ink transition"
            >
              <Sparkles className="h-4 w-4 text-link" strokeWidth={1.75} />
              Open featured wedding
            </MotionLink>
          ) : null}
          <MotionLink
            to="/inbox"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="card-lift inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 type-small text-ink transition"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.75} />
            Review inbox
          </MotionLink>
        </div>
      </MotionSection>

      <MotionSection className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="type-body font-semibold text-ink">Needs attention</h2>
            <span className="type-small text-ink-faint">Prioritized for today</span>
          </div>
          <div className="grid gap-2.5">
            {attention.map((item) => (
              <MotionLink
                key={item.title}
                to={item.to}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="glow-card card-lift group flex items-start gap-4 rounded-lg border border-border bg-surface p-5 transition"
                onMouseMove={handleGlowMove}
                onMouseLeave={handleGlowLeave}
              >
                <div
                  className="icon-glare mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] shadow-md"
                  style={{ background: item.iconGradient }}
                >
                  <item.Icon className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="type-small font-semibold text-ink">{item.title}</p>
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[12px] text-ink-muted">
                      {item.count}
                    </span>
                  </div>
                  <p className="mt-1 type-small text-ink-muted">{item.hint}</p>
                </div>
                <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-ink-faint transition group-hover:text-ink" />
              </MotionLink>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="type-body font-semibold text-ink">Upcoming weddings</h2>
            <Link to="/calendar" className="type-small text-link hover:text-link-hover">
              View calendar
            </Link>
          </div>
          <div className="glow-card card-lift rounded-lg border border-border bg-surface p-1.5" onMouseMove={handleGlowMove} onMouseLeave={handleGlowLeave}>
            {upcomingWeddings.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <CalendarClock className="mx-auto h-6 w-6 text-ink-faint/60" strokeWidth={1.5} />
                <p className="mt-2 type-small text-ink-faint">No upcoming weddings scheduled.</p>
              </div>
            ) : (
              upcomingWeddings.map((w, i) => (
                <Link
                  key={w.id}
                  to={`/wedding/${w.id}`}
                  className={
                    "flex items-center justify-between gap-4 rounded-lg px-4 py-3.5 transition " +
                    (i < upcomingWeddings.length - 1 ? "border-b border-border/60" : "")
                  }
                >
                  <div>
                    <p className="type-small font-semibold text-ink">{w.couple_names}</p>
                    <p className="mt-0.5 flex items-center gap-2 type-small text-ink-muted">
                      <CalendarClock className="h-3.5 w-3.5 text-ink-faint" strokeWidth={1.5} />
                      {formatWeddingDate(w.wedding_date, w.location)}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full border border-border px-2.5 py-0.5 text-[11px] text-ink-muted">
                    {formatStageLabel(w.stage)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </MotionSection>

      <MotionSection className="glow-card group rounded-lg border border-dashed border-border/60 bg-surface-elevated/40 p-5" onMouseMove={handleGlowMove} onMouseLeave={handleGlowLeave}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="icon-glare mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] shadow-md"
              style={{ background: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)" }}
            >
              <FlaskConical className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
            </div>
            <div>
              <p className="type-small font-semibold text-ink">Developer Test</p>
              <p className="mt-0.5 type-small text-ink-muted">
                Fire a simulated inquiry into the live AI pipeline via{" "}
                <span className="font-mono text-[12px] text-ink-faint">webhook-web</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fireTestLead}
            disabled={isSimulating}
            className="card-lift inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 type-small text-ink transition hover:text-link disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSimulating ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-faint/30 border-t-accent" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {isSimulating ? "Sending\u2026" : "Simulate Incoming Lead"}
          </button>
        </div>
        {simResult && (
          <div
            className={
              "mt-3 rounded-lg px-4 py-2 type-small " +
              (simResult.ok
                ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : "border border-red-500/20 bg-red-500/10 text-red-400")
            }
          >
            {simResult.message}
          </div>
        )}
      </MotionSection>
    </MotionPage>
  );
}
