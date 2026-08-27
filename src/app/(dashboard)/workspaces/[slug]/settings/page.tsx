import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkspaceFormatProfile } from "@/app/actions/format-actions";
import { getWorkspaceChannelSettings } from "@/app/actions/workspace-actions";
import { getChannelFacts } from "@/app/actions/fact-actions";
import { resolveFormatProfile } from "@/lib/ai/format-profile";
import SettingsTabs from "@/components/ui/SettingsTabs";

/**
 * Workspace Settings — a server component so both tabs start from the workspace's actual
 * saved state instead of a client-side fetch-on-mount.
 *
 * `[slug]` is the workspace's UUID `id` (same convention as the parent workspace hub page
 * and every video route beneath it — there is no separate slug column).
 */
export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: workspaceId } = await params;

  // One read covers both the header and the Channel tab — `getWorkspaceChannelSettings`
  // already selects `name`, so there is no separate workspace lookup here any more.
  const channelResult = await getWorkspaceChannelSettings(workspaceId);

  if (!channelResult.success || !channelResult.settings) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-ed-text mb-4">Workspace not found</h2>
        <Link href="/workspaces" className="text-ed-accent-text hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const channelSettings = channelResult.settings;

  const formatResult = await getWorkspaceFormatProfile(workspaceId);
  // getWorkspaceFormatProfile degrades rather than failing (see format-actions.ts), so
  // `success: false` here means the workspace row itself vanished between the two queries
  // above — vanishingly unlikely, but resolve a plain default instead of crashing.
  const initialProfile = formatResult.profile ?? resolveFormatProfile({});

  // Degrades to an empty ledger rather than failing when db/add-channel-facts.sql has not
  // run — same contract as getWorkspaceFormatProfile above, so the page renders and the
  // Facts tab explains itself instead of the whole settings route erroring.
  const factsResult = await getChannelFacts(workspaceId);

  return (
    // Fluid, capped at 1600px. A fixed 800px column left roughly a third of a real desktop
    // monitor empty on either side; this uses that space while still keeping a text line
    // from running edge-to-edge on an ultrawide screen. Desktop-first by design.
    <div className="max-w-[1600px] mx-auto px-8 pb-12">
      <div className="mb-8 flex items-start gap-4">
        <Link
          href={`/workspaces/${workspaceId}`}
          className="btn-secondary mt-1 shrink-0"
          style={{ padding: "0.5rem 0.75rem" }}
          aria-label="Back to workspace"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ed-text-dim mb-1">
            {channelSettings.name || "Workspace"}
          </p>
          <h1 className="heading-1" style={{ fontSize: "2rem" }}>
            Channel Settings
          </h1>
          {/* Says what the page governs rather than naming the tabs — the segmented
              control below already labels those, and repeating them here was the only
              thing the old subtitle did. */}
          <p className="text-muted mt-1 max-w-2xl">
            Everything on this page applies to every video this channel generates from now
            on. Videos already in production keep the format they were started with.
          </p>
        </div>
      </div>

      <SettingsTabs
        channelIdentityProps={{ workspaceId, initialSettings: channelSettings }}
        channelFormatProps={{
          workspaceId,
          initialProfile,
          initialPresetKey: formatResult.presetKey ?? null,
          migrationPending: formatResult.migrationPending ?? false,
          // Read-only, so the Format tab's "exact system instruction" preview includes
          // the NAMED SOURCES block generation really sends. Editing happens on Facts.
          verifiedFacts: (factsResult.facts ?? []).filter((fact) => fact.verified),
        }}
        channelFactsProps={{
          workspaceId,
          initialFacts: factsResult.facts ?? [],
          migrationPending: factsResult.migrationPending ?? false,
        }}
      />
    </div>
  );
}
