import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWeddings } from "@/hooks/useWeddings";
import { usePipelineMode } from "./PipelineModeContext";
import { isNonWeddingProjectType, projectTypeBadgeLabel } from "@/lib/projectTypeDisplay";
import { usePipelineWedding } from "./PipelineWeddingContext";

const INQUIRY_STAGES = new Set(["inquiry", "consultation", "proposal_sent", "contract_out"]);
const ACTIVE_STAGES = new Set(["booked", "prep"]);
const DELIVERABLE_STAGES = new Set(["delivered", "final_balance"]);

function personRole(subtitle: string): string {
  const parts = subtitle.split("·");
  return parts[0]?.trim() ?? subtitle;
}

function formatPackageLine(pkg: string, value: string): string {
  if (pkg && value && value !== "—") return `${pkg} · ${value}`;
  if (pkg) return pkg;
  return value || "—";
}

export function PipelineInspector() {
  const { photographerId } = useAuth();
  const { data: weddings } = useWeddings(photographerId ?? "");
  const { weddingId } = usePipelineMode();
  const weddingState = usePipelineWedding();

  const summary = useMemo(() => {
    let inquiries = 0;
    let active = 0;
    let deliverables = 0;
    let archived = 0;
    for (const w of weddings) {
      if (INQUIRY_STAGES.has(w.stage)) inquiries += 1;
      else if (ACTIVE_STAGES.has(w.stage)) active += 1;
      else if (DELIVERABLE_STAGES.has(w.stage)) deliverables += 1;
      else if (w.stage === "archived") archived += 1;
    }
    return { total: weddings.length, inquiries, active, deliverables, archived };
  }, [weddings]);

  if (!weddingId) {
    return (
      <aside className="pane inspector last ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col overflow-hidden border-0">
        <div className="pane-head border-0">
          <h3>Pipeline</h3>
        </div>
        <div className="inspector-body pipeline-insp-empty">
          <div className="p-count-hero">
            <div className="big">
              {summary.total} <em>projects</em>
            </div>
            <div className="caption">Open a project to see detail</div>
          </div>
          <div className="p-insp-card">
            <div className="ct">
              <span>By stage</span>
            </div>
            <div className="p-insp-row">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
              </svg>
              <div>
                <div className="k">Inquiries</div>
                <div className="v">{summary.inquiries}</div>
              </div>
            </div>
            <div className="p-insp-row">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
              </svg>
              <div>
                <div className="k">Active</div>
                <div className="v">{summary.active}</div>
              </div>
            </div>
            <div className="p-insp-row">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
              </svg>
              <div>
                <div className="k">Deliverables</div>
                <div className="v">{summary.deliverables}</div>
              </div>
            </div>
            <div className="p-insp-row">
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1" />
              </svg>
              <div>
                <div className="k">Archived</div>
                <div className="v">{summary.archived}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  if (!weddingState) {
    return (
      <aside className="pane inspector last ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col overflow-hidden border-0">
        <div className="inspector-body flex flex-1 items-center justify-center">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-4)]">
            Loading…
          </span>
        </div>
      </aside>
    );
  }

  const { detailState, entry, setTabAndUrl, projectType } = weddingState;
  const { weddingFields, people } = detailState;
  const venue = weddingFields.where || "Venue TBD";
  const whenLabel = weddingFields.when || entry.when || "—";
  const heroCaption =
    venue !== "Venue TBD" && whenLabel !== "—" ? `Until ${venue} · ${whenLabel}` : `Event · ${whenLabel}`;
  const typeChip = projectTypeBadgeLabel(projectType);

  return (
    <aside className="pane inspector last ana-inbox-port ana-pipeline-port flex h-full min-h-0 flex-col overflow-hidden border-0">
      <div className="pane-head border-0">
        <h3>Project</h3>
        {typeChip ? (
          <p className="mt-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-wide text-[var(--fg-3)]">
            {typeChip}
          </p>
        ) : null}
      </div>
      <div className="inspector-body flex flex-1 flex-col gap-[14px] overflow-y-auto px-[14px] pb-6 pt-0">
        <div className="p-count-hero">
          <div className="big">
            42 <em>days</em>
          </div>
          <div className="caption">{heroCaption}</div>
        </div>

        <div className="p-insp-card">
          <div className="ct">
            <span>{isNonWeddingProjectType(projectType) ? "Event & shoot" : "Event"}</span>
            <button type="button" className="edit" onClick={() => setTabAndUrl("event")}>
              Edit
            </button>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="1" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <div>
              <div className="k">Date</div>
              <div className="v">{whenLabel}</div>
            </div>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div>
              <div className="k">Venue</div>
              <div className="v">{venue}</div>
            </div>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div>
              <div className="k">{isNonWeddingProjectType(projectType) ? "Schedule" : "Ceremony"}</div>
              <div className="v">17:30 · loggia contingency</div>
            </div>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            <div>
              <div className="k">Guests</div>
              <div className="v">~80 · seated dinner</div>
            </div>
          </div>
        </div>

        <div className="p-insp-card">
          <div className="ct">
            <span>People</span>
            <button type="button" className="edit" onClick={() => setTabAndUrl("people")}>
              Manage
            </button>
          </div>
          {people.map((p) => (
            <div key={p.id} className="ppl">
              <div className="avt">{p.name.slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="nm">{p.name}</div>
                <div className="role">{personRole(p.subtitle)}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-insp-card">
          <div className="ct">
            <span>Package & finance</span>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <div>
              <div className="k">Package</div>
              <div className="v">{formatPackageLine(weddingFields.package, weddingFields.value)}</div>
            </div>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M3 12h18M12 3v18" />
            </svg>
            <div>
              <div className="k">Paid</div>
              <div className="v" style={{ color: "var(--color-report-green)" }}>
                {weddingFields.balance || "—"} · {weddingFields.value ? "67%" : "—"}
              </div>
            </div>
          </div>
          <div className="p-insp-row">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            <div>
              <div className="k">Final balance</div>
              <div className="v">due per contract</div>
            </div>
          </div>
        </div>

        <div
          className="p-insp-card pipeline-ana-read-card"
          style={{
            background: "linear-gradient(180deg, rgba(255,86,0,0.04), #fff)",
          }}
        >
          <div className="ct">
            <span>Ana&apos;s read</span>
          </div>
          <p className="pipeline-ana-read-copy">
            Timeline is in a good place — <em>one open decision</em> is the second-look window. Minor weather risk on
            the 6th (22% rain at 14h). I&apos;m holding three drafts for your approval.
          </p>
        </div>
      </div>
    </aside>
  );
}
