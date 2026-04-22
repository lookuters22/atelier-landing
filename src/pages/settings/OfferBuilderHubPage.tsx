import type { Data } from "@measured/puck";
import Lenis from "lenis";
import { ExternalLink, FolderOpen, MessageCircle, Plus, Trash2 } from "lucide-react";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  createOfferProject,
  deleteOfferProject,
  listOfferProjects,
  type OfferProjectRecord,
} from "../../lib/offerProjectsStorage";
import {
  getCachedOfferPreviewHtml,
  OFFER_HOVER_DESIGN_WIDTH_PX,
  OFFER_HOVER_VIEWPORT_HEIGHT_PX,
} from "./OfferHoverPreview";
import TiltedCard from "../../components/TiltedCard";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { openAnaWithOfferBuilderProject } from "../../components/SupportAssistantWidget";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const PREVIEW_SCALE = 280 / OFFER_HOVER_DESIGN_WIDTH_PX;

export function OfferBuilderHubPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { photographerId } = useAuth();
  const [projects, setProjects] = useState<OfferProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listOfferProjects(photographerId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [photographerId]);

  useEffect(() => {
    void refresh();
  }, [refresh, location.pathname]);

  const createNew = useCallback(async () => {
    try {
      const p = await createOfferProject(photographerId);
      await refresh();
      navigate(`/workspace/offer-builder/edit/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project");
    }
  }, [navigate, photographerId, refresh]);

  const openProject = useCallback(
    (id: string) => {
      navigate(`/workspace/offer-builder/edit/${id}`);
    },
    [navigate],
  );

  const removeProject = useCallback(
    async (id: string) => {
      try {
        await deleteOfferProject(id, photographerId);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete project");
      }
    },
    [photographerId, refresh],
  );

  return (
    <div className="w-full">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Offer builder</h1>
        <p className="mt-1 max-w-lg text-[13px] text-muted-foreground">
          Create HTML magazine-style offers. The layout editor runs full screen when you open or create a project.
          {photographerId ? " Projects are saved to your studio account." : " Sign in to sync projects to your studio."}
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void createNew()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Create new project
        </button>
        {photographerId && (
          <Link
            to="/workspace/offer-builder/proposals"
            className="text-[13px] text-primary underline underline-offset-2 hover:text-foreground/90"
          >
            Change proposals (review)
          </Link>
        )}
      </div>

      <section className="mt-10">
        <h3 className="border-b border-border pb-2 text-[15px] font-medium text-foreground">Saved works</h3>
        <p className="mt-3 text-[13px] text-muted-foreground">Right-click a card for options; click to open.</p>

        {loading ? (
          <p className="mt-6 text-[13px] text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="mt-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderOpen className="h-6 w-6" />
                </EmptyMedia>
                <EmptyTitle>No saved projects</EmptyTitle>
                <EmptyDescription>Create one to get started.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <button
                  type="button"
                  onClick={() => void createNew()}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition hover:bg-foreground/90"
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  Create new project
                </button>
              </EmptyContent>
            </Empty>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {projects.map((p) => (
              <ContextMenu key={p.id}>
                <ContextMenuTrigger asChild>
                  <ProjectTiltedCard project={p} onOpen={() => openProject(p.id)} />
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => openProject(p.id)}>
                    <ExternalLink className="mr-2 h-4 w-4" /> Open project
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => openAnaWithOfferBuilderProject(p.id)}>
                    <MessageCircle className="mr-2 h-4 w-4" /> Ask Ana (this offer)
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem className="text-red-400" onClick={() => void removeProject(p.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const ProjectTiltedCard = forwardRef<HTMLElement, { project: OfferProjectRecord; onOpen: () => void }>(
  function ProjectTiltedCard({ project, onOpen, ...rest }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const lenisRef = useRef<Lenis | null>(null);
    const rafRef = useRef(0);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const html = getCachedOfferPreviewHtml(project.data as Data, `project:${project.id}`);
      const onLoad = () => {
        setLoaded(true);

        const doc = iframe.contentWindow?.document;
        if (!doc) return;

        lenisRef.current?.destroy();
        const lenis = new Lenis({
          wrapper: doc.documentElement,
          content: doc.body,
          duration: 1.2,
          easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
          smoothWheel: true,
          wheelMultiplier: 0.8,
        });
        lenisRef.current = lenis;

        const tick = (time: number) => {
          lenis.raf(time);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      };
      iframe.addEventListener("load", onLoad);
      iframe.srcdoc = html;
      return () => {
        iframe.removeEventListener("load", onLoad);
        cancelAnimationFrame(rafRef.current);
        lenisRef.current?.destroy();
      };
    }, [project.data, project.id]);

    const onWheel = useCallback((e: React.WheelEvent) => {
      e.stopPropagation();
      const lenis = lenisRef.current;
      if (lenis) {
        lenis.scrollTo(lenis.scroll + e.deltaY, { immediate: false });
      }
    }, []);

    return (
      <TiltedCard
        ref={ref}
        containerHeight="auto"
        containerWidth="100%"
        rotateAmplitude={10}
        scaleOnHover={1.04}
        showTooltip
        captionText={project.name}
        onClick={onOpen}
        {...rest}
      >
        <div
          className="relative overflow-hidden rounded-[15px] border border-border bg-[#fafaf9]"
          style={{ aspectRatio: "3/4" }}
          onWheel={onWheel}
        >
          <iframe
            ref={iframeRef}
            title={`Preview ${project.name}`}
            className="pointer-events-none block origin-top-left border-0"
            style={{
              width: OFFER_HOVER_DESIGN_WIDTH_PX,
              height: OFFER_HOVER_VIEWPORT_HEIGHT_PX,
              transform: `scale(${PREVIEW_SCALE})`,
            }}
          />
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#fafaf9] text-[11px] text-muted-foreground">
              Loading…
            </div>
          )}
        </div>
      </TiltedCard>
    );
  },
);
