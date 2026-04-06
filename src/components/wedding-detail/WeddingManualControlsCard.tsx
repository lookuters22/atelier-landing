/**
 * Phase 11 Step 11D — manual pause controls on `weddings` plus default automation on all `threads`
 * for this wedding (batch `automation_mode`).
 */
import { useCallback, useEffect, useState } from "react";
import { HandHeart, Lock, PauseCircle, SlidersHorizontal } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { cn } from "@/lib/utils";

type AutomationMode = "auto" | "draft_only" | "human_only";

export function WeddingManualControlsCard({
  weddingId,
  photographerId,
}: {
  weddingId: string;
  photographerId: string;
}) {
  const [compassionPause, setCompassionPause] = useState(false);
  const [strategicPause, setStrategicPause] = useState(false);
  const [agencyCcLock, setAgencyCcLock] = useState(false);
  const [automationMode, setAutomationMode] = useState<AutomationMode>("auto");
  const [threadsMixed, setThreadsMixed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [wRes, tRes] = await Promise.all([
      supabase
        .from("weddings")
        .select("compassion_pause, strategic_pause, agency_cc_lock")
        .eq("id", weddingId)
        .eq("photographer_id", photographerId)
        .maybeSingle(),
      supabase
        .from("threads")
        .select("automation_mode")
        .eq("wedding_id", weddingId)
        .eq("photographer_id", photographerId),
    ]);

    if (wRes.error) {
      setError(wRes.error.message);
    } else if (wRes.data) {
      setCompassionPause(!!wRes.data.compassion_pause);
      setStrategicPause(!!wRes.data.strategic_pause);
      setAgencyCcLock(!!wRes.data.agency_cc_lock);
    }

    if (tRes.error) {
      setError((prev) => (prev ? `${prev}; ${tRes.error.message}` : tRes.error.message));
    } else {
      const modes = (tRes.data ?? []).map((r) => r.automation_mode as AutomationMode);
      if (modes.length === 0) {
        setAutomationMode("auto");
        setThreadsMixed(false);
      } else {
        const first = modes[0];
        const mixed = modes.some((m) => m !== first);
        setThreadsMixed(mixed);
        setAutomationMode(first);
      }
    }
    setLoading(false);
  }, [weddingId, photographerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchWedding(patch: {
    compassion_pause?: boolean;
    strategic_pause?: boolean;
    agency_cc_lock?: boolean;
  }) {
    setSaving("wedding");
    setError(null);
    const { error: err } = await supabase
      .from("weddings")
      .update(patch)
      .eq("id", weddingId)
      .eq("photographer_id", photographerId);
    setSaving(null);
    if (err) {
      setError(err.message);
      void load();
    }
  }

  async function applyAutomationAllThreads(mode: AutomationMode) {
    setSaving("threads");
    setError(null);
    const { error: err } = await supabase
      .from("threads")
      .update({ automation_mode: mode })
      .eq("wedding_id", weddingId)
      .eq("photographer_id", photographerId);
    setSaving(null);
    if (err) {
      setError(err.message);
      void load();
      return;
    }
    setAutomationMode(mode);
    setThreadsMixed(false);
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-[12px] text-muted-foreground">
        Loading manual controls…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <PauseCircle className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
          Pauses and automation
        </p>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Phase 11D — wedding pause flags; automation applies to all threads on this wedding.
      </p>

      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}

      <ul className="mt-4 space-y-3">
        <PauseRow
          icon={HandHeart}
          label="Compassion pause"
          description="Hold non-urgent automation when circumstances need space."
          checked={compassionPause}
          disabled={saving !== null}
          onChange={async (v) => {
            setCompassionPause(v);
            await patchWedding({ compassion_pause: v });
          }}
        />
        <PauseRow
          icon={PauseCircle}
          label="Strategic pause"
          description="Negotiation or planner conflict — pause proactive outreach."
          checked={strategicPause}
          disabled={saving !== null}
          onChange={async (v) => {
            setStrategicPause(v);
            await patchWedding({ strategic_pause: v });
          }}
        />
        <PauseRow
          icon={Lock}
          label="Agency CC lock"
          description="Restrict agency or CC handling until you clear this."
          checked={agencyCcLock}
          disabled={saving !== null}
          onChange={async (v) => {
            setAgencyCcLock(v);
            await patchWedding({ agency_cc_lock: v });
          }}
        />
      </ul>

      <div className="mt-5 border-t border-border pt-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-[12px] font-medium text-foreground">Automation mode (all threads)</span>
        </div>
        {threadsMixed ? (
          <p className="mt-1 text-[11px] text-amber-800">Threads had mixed modes — pick one to align all.</p>
        ) : null}
        <label className="mt-2 block">
          <span className="sr-only">Automation mode</span>
          <select
            value={automationMode}
            disabled={saving !== null}
            onChange={(e) => void applyAutomationAllThreads(e.target.value as AutomationMode)}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-2 text-[13px] text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="auto">Auto</option>
            <option value="draft_only">Draft only</option>
            <option value="human_only">Human only</option>
          </select>
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Updates every thread for this wedding. Per-thread control remains in Inbox.
        </p>
      </div>

      {saving ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{saving === "wedding" ? "Saving…" : "Updating threads…"}</p>
      ) : null}
    </div>
  );
}

function PauseRow({
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  icon: typeof HandHeart;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void | Promise<void>;
}) {
  return (
    <li className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => void onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors",
          checked ? "border-emerald-500/60 bg-emerald-500/20" : "border-border bg-muted/40",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-[13px] font-medium text-foreground">{label}</span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}
