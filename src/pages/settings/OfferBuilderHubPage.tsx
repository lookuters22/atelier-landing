import type { Data } from "@measured/puck";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getTemplateCoverThumbnailSrc } from "../../features/offer-puck/templates/registry";
import { createOfferProject, listOfferProjects, type OfferProjectRecord } from "../../lib/offerProjectsStorage";
import { getCachedOfferPreviewHtml, OfferHoverPreview } from "./OfferHoverPreview";

export function OfferBuilderHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [projects, setProjects] = useState(() => listOfferProjects());

  useEffect(() => {
    setProjects(listOfferProjects());
  }, [location.pathname]);
  const [hoverProject, setHoverProject] = useState<OfferProjectRecord | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const refresh = useCallback(() => setProjects(listOfferProjects()), []);

  const onTileMove = useCallback((e: React.MouseEvent) => {
    setMouse({ x: e.clientX, y: e.clientY });
  }, []);

  const createNew = useCallback(() => {
    const p = createOfferProject();
    refresh();
    navigate(`/settings/offer-builder/edit/${p.id}`);
  }, [navigate, refresh]);

  const openProject = useCallback(
    (id: string) => {
      navigate(`/settings/offer-builder/edit/${id}`);
    },
    [navigate],
  );

  const hoverHtml = useMemo(
    () => (hoverProject ? getCachedOfferPreviewHtml(hoverProject.data, `project:${hoverProject.id}`) : ""),
    [hoverProject],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Offer builder</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          Create HTML magazine-style offers. Open a saved project or start fresh — the layout editor runs full screen when you open or create a project.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={createNew}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-canvas shadow-sm transition hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create new project
        </button>
      </div>

      <section>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">Saved works</p>
        <p className="mt-1 text-[13px] text-ink-muted">Hover a tile for a live preview; click to open.</p>

        {projects.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-border bg-canvas/90 px-4 py-6 text-center text-[13px] text-ink-muted">
            No saved projects yet. Create one to get started.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {projects.map((p) => (
              <SavedWorkTile
                key={p.id}
                project={p}
                onOpen={() => openProject(p.id)}
                onHoverStart={(e) => {
                  setHoverProject(p);
                  setMouse({ x: e.clientX, y: e.clientY });
                }}
                onHoverEnd={() => setHoverProject(null)}
                onMouseMove={onTileMove}
              />
            ))}
          </div>
        )}
      </section>

      {hoverProject ? (
        <OfferHoverPreview label={hoverProject.name} active mouse={mouse} html={hoverHtml} />
      ) : null}
    </div>
  );
}

function SavedWorkTile({
  project,
  onOpen,
  onHoverStart,
  onHoverEnd,
  onMouseMove,
}: {
  project: OfferProjectRecord;
  onOpen: () => void;
  onHoverStart: (e: React.MouseEvent) => void;
  onHoverEnd: () => void;
  onMouseMove: (e: React.MouseEvent) => void;
}) {
  const thumb = getTemplateCoverThumbnailSrc(project.data as Data);
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onMouseMove={onMouseMove}
      className="group relative flex aspect-square overflow-hidden rounded-lg border border-border text-left transition hover:border-accent/40 hover:ring-1 hover:ring-accent/30"
    >
      {thumb ? (
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-neutral-200" aria-hidden />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
      <span className="absolute bottom-0 left-0 right-0 p-2 text-[10px] font-semibold uppercase leading-tight tracking-wide text-white drop-shadow-sm">
        {project.name}
      </span>
    </button>
  );
}
