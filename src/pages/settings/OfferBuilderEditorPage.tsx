import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getOfferProject, type OfferProjectRecord } from "../../lib/offerProjectsStorage";
import { OfferBuilderShellProvider } from "./offerBuilderShellContext";
import { OfferBuilderUnifiedBar } from "./OfferBuilderUnifiedBar";
import { OfferPuckEditor } from "./OfferPuckEditor";

export function OfferBuilderEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { photographerId } = useAuth();
  const [project, setProject] = useState<OfferProjectRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const p = await getOfferProject(projectId, photographerId);
        if (!cancelled) setProject(p ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
          setProject(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, photographerId]);

  if (project === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
        <p className="text-[13px] text-muted-foreground">Loading project…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
        <p className="text-[13px] text-destructive">{error}</p>
        <Link to="/workspace/offer-builder" className="text-[13px] text-primary underline underline-offset-2">
          Back to offer builder
        </Link>
      </div>
    );
  }

  if (!projectId || !project) {
    return <Navigate to="/workspace/offer-builder" replace />;
  }

  return (
    <OfferBuilderShellProvider>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <OfferBuilderUnifiedBar offerProjectId={project.id} />
        <div className="min-h-0 flex-1 overflow-hidden">
          <OfferPuckEditor initialProject={project} photographerId={photographerId} />
        </div>
      </div>
    </OfferBuilderShellProvider>
  );
}
