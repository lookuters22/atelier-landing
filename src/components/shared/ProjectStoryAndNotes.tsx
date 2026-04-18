import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PaneInspectorSectionTitle, PANE_INSPECTOR_IDLE_LIST_CARD, PANE_INSPECTOR_SECONDARY } from "@/components/panes";
import { supabase } from "../../lib/supabase";

const STORAGE_KEY = (id: string) => `atelier.weddingDetail.${id}`;

function loadNotes(projectId: string): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { photographerNotes?: string };
    return typeof parsed.photographerNotes === "string" ? parsed.photographerNotes : "";
  } catch {
    return "";
  }
}

function saveNotes(projectId: string, notes: string) {
  try {
    const key = STORAGE_KEY(projectId);
    const raw = localStorage.getItem(key);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    existing.photographerNotes = notes;
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* quota */ }
}

export function ProjectStoryAndNotes({ projectId }: { projectId: string }) {
  const [story, setStory] = useState("");
  const [notes, setNotes] = useState(() => loadNotes(projectId));
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const notesRef = useRef(notes);
  notesRef.current = notes;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("weddings")
      .select("story_notes")
      .eq("id", projectId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setStory(data?.story_notes ?? "");
        setLoading(false);
      });
    setNotes(loadNotes(projectId));
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    const t = window.setTimeout(() => saveNotes(projectId, notesRef.current), 650);
    return () => window.clearTimeout(t);
  }, [notes, projectId]);

  const regenerateSummary = useCallback(() => {
    setSummaryBusy(true);
    window.setTimeout(() => setSummaryBusy(false), 900);
  }, []);

  if (loading) {
    return (
      <div className={cn(PANE_INSPECTOR_IDLE_LIST_CARD)}>
        <p className={PANE_INSPECTOR_SECONDARY}>Loading story&hellip;</p>
      </div>
    );
  }

  return (
    <div className={PANE_INSPECTOR_IDLE_LIST_CARD}>
      <PaneInspectorSectionTitle className="mb-0">Story so far</PaneInspectorSectionTitle>
      <p className="mt-3 text-[13px] leading-relaxed text-foreground">
        {story || "No AI summary generated yet."}
      </p>
      <button
        type="button"
        disabled={summaryBusy}
        className="mt-4 text-[12px] font-semibold text-[#2563eb] hover:text-[#2563eb]/80 disabled:opacity-50"
        onClick={regenerateSummary}
      >
        {summaryBusy ? "Regenerating\u2026" : "Regenerate summary"}
      </button>

      <div className="mt-5 border-t border-border pt-4">
        <label htmlFor={`project-notes-${projectId}`}>
          <PaneInspectorSectionTitle className="mb-0">My notes</PaneInspectorSectionTitle>
        </label>
        <textarea
          id={`project-notes-${projectId}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Private notes for your studio \u2014 not shared with clients."
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/50"
        />
        <p className={cn("mt-1.5", PANE_INSPECTOR_SECONDARY, "text-[11px]")}>
          Saved automatically in this browser.
        </p>
      </div>
    </div>
  );
}
