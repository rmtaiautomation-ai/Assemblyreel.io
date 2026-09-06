import Link from "next/link";
import React from "react";
import { Plus, ArrowRight, FolderOpen, Smartphone, Clapperboard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * Three buckets, not eight.
 *
 * The workspace hub (`[slug]/page.tsx`) has a full `statusView` with a label,
 * a chip and a bar colour for every project status, because that page shows
 * one row per project. A card in this grid summarises a whole channel in a
 * single line, so the only question worth answering here is "is there work
 * left in this workspace?" — which collapses the ladder to done / broken /
 * still moving. Reaching for the eight-way version would put eight colours on
 * a card the size of a business card.
 */
type Bucket = "exported" | "failed" | "active";

function bucketOf(raw: string | null | undefined): Bucket {
  // `completed` is the pre-rename value still sitting in existing rows —
  // migrate-project-status.sql is applied by hand, so both must read correctly.
  if (raw === "exported" || raw === "completed") return "exported";
  if (raw === "failed") return "failed";
  return "active";
}

/** "Alternative History" -> "AH", "Enoch" -> "EN". Two glyphs, always. */
function monogram(name: string) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function timeAgo(dateString: string) {
  const mins = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function DashboardHome() {
  const supabase = await createClient();

  // Was `video_projects(count)`, which could only ever produce the number on the
  // card. Pulling the two narrow columns instead costs a few rows per workspace
  // and buys the status mix and the real last-touched time.
  const { data: workspaces, error } = await supabase
    .from("workspaces")
    .select("*, video_projects(status, updated_at)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching workspaces:", error);
  }

  const workspaceList = workspaces || [];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-ed-text tracking-tight">Workspaces</h1>
            {workspaceList.length > 0 && (
              <span className="text-xs font-medium text-ed-text-faint bg-ed-well border border-ed-border rounded-full px-2.5 py-1">
                {workspaceList.length}
              </span>
            )}
          </div>
          <p className="text-ed-text-dim mt-1">Manage your niche video channels and sub-accounts.</p>
        </div>
        <Link href="/workspaces/new" className="ed-cta">
          <Plus size={16} className="shrink-0" />
          New Workspace
        </Link>
      </div>

      {workspaceList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 py-24 glass-panel border-dashed border-2 border-ed-border">
          <div className="w-16 h-16 rounded-full bg-ed-accent-soft flex items-center justify-center mb-4">
            <FolderOpen size={32} className="text-ed-accent" />
          </div>
          <h2 className="text-xl font-semibold text-ed-text mb-2">No workspaces yet</h2>
          <p className="text-muted text-center max-w-md mb-6">
            Create your first workspace to start generating automated video content, managing voice actors, and building your audience.
          </p>
          <Link href="/workspaces/new" className="btn-primary flex items-center justify-center">
            <Plus size={16} className="mr-2" />
            Create Workspace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {workspaceList.map((ws) => {
            const projects: { status: string | null; updated_at: string }[] = ws.video_projects || [];
            const total = projects.length;
            const exported = projects.filter((p) => bucketOf(p.status) === "exported").length;
            const failed = projects.filter((p) => bucketOf(p.status) === "failed").length;
            const active = total - exported - failed;

            const lastTouched =
              projects.reduce<string | null>(
                (latest, p) => (!latest || p.updated_at > latest ? p.updated_at : latest),
                null,
              ) ?? ws.updated_at ?? ws.created_at;

            const isShorts = ws.aspect_ratio === "9:16";

            return (
              // The WHOLE card is the link. The old design had an "Enter Workspace"
              // bar at the bottom filled with `bg-ed-surface` — the same value as the
              // card behind it — so it rendered as unstyled text and the only real
              // click target on the card looked like a caption.
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className="group glass-panel p-5 flex flex-col gap-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ed-accent/40"
              >
                {/* Identity. `min-w-0` on the text column is load-bearing: without it
                    a flex child refuses to shrink below its content and `truncate`
                    silently does nothing, which is how long theme names used to
                    spill past the card's right edge. */}
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-ed-accent-soft border border-ed-accent-border flex items-center justify-center">
                    <span className="text-sm font-bold tracking-wide text-ed-accent-text">
                      {monogram(ws.name)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold text-ed-text tracking-tight truncate" title={ws.name}>
                      {ws.name}
                    </h3>
                    <p className="text-sm text-ed-text-dim truncate mt-0.5" title={ws.content_theme}>
                      {ws.content_theme}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    className="shrink-0 mt-1 text-ed-text-faint transition-all group-hover:text-ed-accent-text group-hover:translate-x-0.5"
                  />
                </div>

                {/* Where the channel stands, as one bar rather than two filled tiles.
                    An empty workspace gets a flat rail instead of a bar with nothing
                    in it, so "no videos yet" reads as a state and not as a glitch. */}
                <div className="flex h-1.5 gap-0.5 rounded-full overflow-hidden bg-ed-well">
                  {total > 0 && (
                    <>
                      {exported > 0 && <div className="bg-ed-ok" style={{ flexGrow: exported }} />}
                      {active > 0 && <div className="bg-ed-accent" style={{ flexGrow: active }} />}
                      {failed > 0 && <div className="bg-ed-danger" style={{ flexGrow: failed }} />}
                    </>
                  )}
                </div>

                <div className="flex items-baseline gap-2 text-sm">
                  <span className="text-2xl font-semibold text-ed-text leading-none tabular-nums">{total}</span>
                  <span className="text-ed-text-dim">{total === 1 ? "video" : "videos"}</span>
                  {total > 0 && (
                    <span className="ml-auto flex items-center gap-3 text-xs text-ed-text-dim tabular-nums">
                      {active > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-ed-accent" />
                          {active} in progress
                        </span>
                      )}
                      {exported > 0 && (
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-ed-ok" />
                          {exported} done
                        </span>
                      )}
                      {failed > 0 && (
                        <span className="flex items-center gap-1.5 text-ed-danger">
                          <span className="w-1.5 h-1.5 rounded-full bg-ed-danger" />
                          {failed} failed
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {/* Micro chrome — a hairline, not a third panel. */}
                <div className="flex items-center gap-2 pt-3 mt-auto border-t border-ed-border text-xs text-ed-text-faint">
                  <span className="flex items-center gap-1.5 shrink-0">
                    {isShorts ? <Smartphone size={13} /> : <Clapperboard size={13} />}
                    {isShorts ? "9:16 Shorts" : "16:9 Cinematic"}
                  </span>
                  <span className="text-ed-border-strong">·</span>
                  <span className="truncate">{ws.visual_aesthetic || "Cinematic"}</span>
                  <span className="ml-auto shrink-0">{timeAgo(lastTouched)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
