import React from "react";
import Link from "next/link";
import { Clapperboard, ImageIcon, MonitorPlay } from "lucide-react";

/**
 * The three per-video surfaces, as one tab group.
 *
 * Extracted because the Scene Board used to be the odd one out: Thumbnails and the
 * Timeline linked to each other as real routes, while the Scene Board was only
 * reachable as a modal owned by `TimelineEditor` — which shadowed an already-existing
 * route that nothing linked to. Every entry point now goes through this component, so
 * the three tabs cannot drift apart again.
 */

export type VideoTabId = "scene-board" | "timeline" | "thumbnails";

// Timeline first: it is the surface the editor opens on and the one users return
// to between every other task, so it reads as the home of the group rather than
// something tucked between two side trips.
const TABS: Array<{ id: VideoTabId; label: string; icon: React.ReactNode; href: (base: string) => string }> = [
  {
    id: "timeline",
    label: "Timeline",
    icon: <MonitorPlay size={13} />,
    href: (base) => base,
  },
  {
    id: "scene-board",
    label: "Scene Board",
    icon: <Clapperboard size={13} />,
    href: (base) => `${base}/scene-board`,
  },
  {
    id: "thumbnails",
    label: "Thumbnails",
    icon: <ImageIcon size={13} />,
    href: (base) => `${base}/thumbnails`,
  },
];

export default function VideoTabs({
  workspaceId,
  videoId,
  active,
}: {
  workspaceId: string;
  videoId: string;
  active: VideoTabId;
}) {
  const base = `/workspaces/${workspaceId}/videos/${videoId}`;

  return (
    <div className="flex items-center gap-1 bg-ed-well rounded-lg p-1 shrink-0">
      {TABS.map((tab) =>
        tab.id === active ? (
          <span
            key={tab.id}
            className="flex items-center gap-1.5 text-[11px] font-bold text-ed-base bg-ed-accent px-2.5 py-1 rounded-md"
          >
            {tab.icon}
            {tab.label}
          </span>
        ) : (
          <Link
            key={tab.id}
            href={tab.href(base)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-ed-text hover:bg-ed-hover px-2.5 py-1 rounded-md transition-colors"
          >
            {tab.icon}
            {tab.label}
          </Link>
        )
      )}
    </div>
  );
}
