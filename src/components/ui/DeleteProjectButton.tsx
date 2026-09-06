"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteVideoProject } from "@/app/actions/video-actions";

/**
 * The Library card's delete control.
 *
 * `window.confirm` rather than a bespoke inline confirm step, matching every other
 * destructive action in the app (see `removeScenesAndPersist` in TimelineEditor).
 * The message names the project and spells out what leaves with it, because a
 * project row is the root of the cascade — scenes, media, narration, overlays and
 * thumbnails all go, and none of it is recoverable.
 *
 * Rendered as a sibling of the card's `<Link>`, never inside it: a `<button>` nested
 * in an anchor is invalid markup, and the click would have to fight the navigation.
 * `stopPropagation` is still here for the hover/active styling the parent card
 * applies to the whole group.
 */
export default function DeleteProjectButton({
  projectId,
  workspaceId,
  topic,
}: {
  projectId: string;
  workspaceId: string;
  topic: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = topic?.trim() || "Untitled";

  const handleDelete = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (isPending) return;

    const confirmed = window.confirm(
      `Permanently delete "${label}"?\n\n` +
      `This removes the script, scenes, narration audio, generated visuals, ` +
      `thumbnails and any rendered export for this video.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteVideoProject(projectId, workspaceId);
      if (!result.success) {
        setError(result.error ?? "Could not delete this video.");
        return;
      }
      // The action revalidates the hub's path, but this component is rendered inside
      // an already-mounted client tree — `refresh()` is what actually pulls the new
      // server render in, otherwise the card stays on screen until a hard reload.
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      title={error ?? `Delete "${label}"`}
      aria-label={`Delete ${label}`}
      // Hidden until the card is hovered or the button itself is focused, so the
      // Library reads as a list of videos rather than a list of delete buttons —
      // but still reachable by keyboard, which `hidden`/`display:none` would break.
      className={`absolute top-1.5 right-1.5 z-10 p-1 rounded-md transition-all
        opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none
        focus-visible:ring-1 focus-visible:ring-ed-danger
        ${error ? "opacity-100 text-ed-danger" : "text-ed-text-faint hover:text-ed-danger hover:bg-ed-danger-soft"}
        disabled:cursor-not-allowed disabled:opacity-100`}
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
    </button>
  );
}
