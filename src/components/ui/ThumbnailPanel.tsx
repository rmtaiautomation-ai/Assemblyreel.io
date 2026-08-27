"use client";

import React, { useState } from "react";
import { Loader2, RefreshCw, Star, Trash2, AlertTriangle, Sparkles, Film } from "lucide-react";
import {
  generateConceptThumbnails,
  generateFinalThumbnails,
  regenerateThumbnail,
  selectThumbnail,
  deleteThumbnail,
  type ThumbnailRow,
} from "@/app/actions/thumbnail-actions";

/**
 * Per-video thumbnail generator. Two independent passes, each producing its own
 * `ThumbnailRow`s: Concept (before render, built from a scene's own visual prompt) and
 * Final (after render, built from a real extracted frame) — see `thumbnail-actions.ts`.
 */

export interface ThumbnailPanelProps {
  projectId: string;
  initialThumbnails: ThumbnailRow[];
  initialError?: string;
  hasFinalExport: boolean;
}

function imageUrlFor(thumbnail: ThumbnailRow): string | null {
  return thumbnail.composited_media?.url ?? thumbnail.source_media?.url ?? null;
}

export default function ThumbnailPanel({
  projectId,
  initialThumbnails,
  initialError,
  hasFinalExport,
}: ThumbnailPanelProps) {
  const [thumbnails, setThumbnails] = useState<ThumbnailRow[]>(initialThumbnails);
  const [error, setError] = useState<string | undefined>(initialError);
  const [generatingConcept, setGeneratingConcept] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const setBusy = (id: string, busy: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleGenerateConcept = async () => {
    setGeneratingConcept(true);
    setError(undefined);
    const result = await generateConceptThumbnails(projectId);
    if (result.success && result.thumbnails) {
      setThumbnails((prev) => [...result.thumbnails!, ...prev]);
    } else {
      setError(result.error || "Failed to generate concept thumbnail.");
    }
    setGeneratingConcept(false);
  };

  const handleGenerateFinal = async () => {
    setGeneratingFinal(true);
    setError(undefined);
    const result = await generateFinalThumbnails(projectId);
    if (result.success && result.thumbnails) {
      setThumbnails((prev) => [...result.thumbnails!, ...prev]);
    } else {
      setError(result.error || "Failed to generate final thumbnails.");
    }
    setGeneratingFinal(false);
  };

  const handleRegenerate = async (id: string) => {
    setBusy(id, true);
    const result = await regenerateThumbnail(id);
    if (result.success && result.thumbnail) {
      setThumbnails((prev) => prev.map((t) => (t.id === id ? result.thumbnail! : t)));
    } else {
      setError(result.error || "Regeneration failed.");
    }
    setBusy(id, false);
  };

  const handleSelect = async (id: string) => {
    setBusy(id, true);
    const result = await selectThumbnail(id);
    if (result.success) {
      setThumbnails((prev) => prev.map((t) => ({ ...t, is_selected: t.id === id })));
    } else {
      setError(result.error || "Could not select this thumbnail.");
    }
    setBusy(id, false);
  };

  const handleDelete = async (id: string) => {
    setBusy(id, true);
    const result = await deleteThumbnail(id);
    if (result.success) {
      setThumbnails((prev) => prev.filter((t) => t.id !== id));
    } else {
      setError(result.error || "Could not delete this thumbnail.");
      setBusy(id, false);
    }
  };

  const conceptThumbnails = thumbnails.filter((t) => t.pass === "concept");
  const finalThumbnails = thumbnails.filter((t) => t.pass === "final");

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-ed-danger-border bg-ed-danger-soft px-3 py-2 text-xs text-ed-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ed-text flex items-center gap-1.5">
              <Sparkles size={14} className="text-ed-accent-text" />
              Concept
            </h2>
            <p className="text-xs text-ed-text-dim mt-0.5">
              Early directions built from your script's visuals — no render needed yet.
            </p>
          </div>
          <button
            onClick={handleGenerateConcept}
            disabled={generatingConcept}
            className="bg-ed-accent hover:bg-ed-accent-hover disabled:bg-ed-border-strong disabled:cursor-not-allowed text-ed-base px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
          >
            {generatingConcept ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generatingConcept ? "Generating…" : "Generate Concept"}
          </button>
        </div>
        <ThumbnailGrid
          thumbnails={conceptThumbnails}
          busyIds={busyIds}
          onRegenerate={handleRegenerate}
          onSelect={handleSelect}
          onDelete={handleDelete}
          emptyLabel="No concept thumbnails yet."
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-ed-text flex items-center gap-1.5">
              <Film size={14} className="text-ed-accent-text" />
              Final
            </h2>
            <p className="text-xs text-ed-text-dim mt-0.5">
              Built from real frames of the finished export.
            </p>
          </div>
          <button
            onClick={handleGenerateFinal}
            disabled={generatingFinal || !hasFinalExport}
            title={hasFinalExport ? undefined : "Render this video first"}
            className="bg-ed-accent hover:bg-ed-accent-hover disabled:bg-ed-border-strong disabled:cursor-not-allowed text-ed-base px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm shrink-0"
          >
            {generatingFinal ? <Loader2 size={13} className="animate-spin" /> : <Film size={13} />}
            {generatingFinal ? "Generating…" : "Generate Final"}
          </button>
        </div>
        <ThumbnailGrid
          thumbnails={finalThumbnails}
          busyIds={busyIds}
          onRegenerate={handleRegenerate}
          onSelect={handleSelect}
          onDelete={handleDelete}
          emptyLabel={hasFinalExport ? "No final thumbnails yet." : "Render the video to unlock this pass."}
        />
      </section>
    </div>
  );
}

function ThumbnailGrid({
  thumbnails,
  busyIds,
  onRegenerate,
  onSelect,
  onDelete,
  emptyLabel,
}: {
  thumbnails: ThumbnailRow[];
  busyIds: Set<string>;
  onRegenerate: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  emptyLabel: string;
}) {
  if (thumbnails.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ed-border bg-ed-surface px-4 py-8 text-center text-xs text-ed-text-faint">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {thumbnails.map((thumbnail) => (
        <ThumbnailCard
          key={thumbnail.id}
          thumbnail={thumbnail}
          busy={busyIds.has(thumbnail.id)}
          onRegenerate={() => onRegenerate(thumbnail.id)}
          onSelect={() => onSelect(thumbnail.id)}
          onDelete={() => onDelete(thumbnail.id)}
        />
      ))}
    </div>
  );
}

function ThumbnailCard({
  thumbnail,
  busy,
  onRegenerate,
  onSelect,
  onDelete,
}: {
  thumbnail: ThumbnailRow;
  busy: boolean;
  onRegenerate: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const imageUrl = imageUrlFor(thumbnail);

  return (
    <div
      className={`group relative rounded-lg border bg-ed-surface overflow-hidden shadow-sm transition-colors ${
        thumbnail.is_selected ? "border-ed-accent-border ring-2 ring-ed-accent-border" : "border-ed-border"
      }`}
    >
      <div className="relative aspect-video bg-ed-raised">
        {imageUrl ? (
          <img src={imageUrl} alt={thumbnail.headline_text || "Thumbnail"} className="w-full h-full object-cover" />
        ) : thumbnail.status === "failed" ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-ed-danger px-2 text-center">
            <AlertTriangle size={18} />
            <span className="text-[10px]">{thumbnail.error_message || "Generation failed"}</span>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-ed-text-faint" />
          </div>
        )}

        {thumbnail.is_selected && (
          <span className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-ed-accent text-ed-base text-[10px] font-bold px-1.5 py-0.5 rounded">
            <Star size={10} className="fill-ed-text" />
            Selected
          </span>
        )}

        <div className="absolute inset-0 bg-ed-media/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button
            onClick={onSelect}
            disabled={busy || thumbnail.status !== "ready"}
            title="Use as this video's thumbnail"
            className="p-1.5 rounded-md bg-ed-surface/90 hover:bg-ed-surface text-ed-text-dim disabled:opacity-40 transition-colors"
          >
            <Star size={13} />
          </button>
          <button
            onClick={onRegenerate}
            disabled={busy}
            title="Regenerate"
            className="p-1.5 rounded-md bg-ed-surface/90 hover:bg-ed-surface text-ed-text-dim disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            title="Delete"
            className="p-1.5 rounded-md bg-ed-surface/90 hover:bg-ed-surface text-ed-danger disabled:opacity-40 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {thumbnail.headline_text && (
        <div className="px-2 py-1.5">
          <p className="text-[11px] font-medium text-ed-text-dim truncate" title={thumbnail.headline_text}>
            {thumbnail.headline_text}
          </p>
        </div>
      )}
    </div>
  );
}
