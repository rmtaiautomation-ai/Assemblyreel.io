"use client";

import React, { useState } from "react";
import { Sliders, Sparkles, BookMarked } from "lucide-react";
import ChannelFormatSection, {
  type ChannelFormatSectionProps,
} from "@/components/ui/ChannelFormatSection";
import ChannelIdentitySection, {
  type ChannelIdentitySectionProps,
} from "@/components/ui/ChannelIdentitySection";
import ChannelFactsSection, {
  type ChannelFactsSectionProps,
} from "@/components/ui/ChannelFactsSection";

/**
 * The tab shell for Workspace Settings.
 *
 * Three tabs, all of which write to the database:
 *
 *   Channel — the workspace row's own columns (name, niche, art style, aspect ratio,
 *             language, target length, narration voice). These existed from day one but
 *             were write-once: only the creation wizard could set them.
 *   Format  — the Channel Blueprint the generation agents compile into prompts.
 *   Facts   — the ledger of named sources a script may cite. Separate from Format rather
 *             than a section inside it because it is edited on a different schedule and by
 *             a different kind of attention: Format is set once and rarely revisited, while
 *             Facts accrues rows over a channel's life and each one needs verifying.
 *
 * It previously had three, of which two (Appearance, Providers) were mock forms that
 * discarded every edit — see ChannelIdentitySection's doc comment for why they're gone
 * rather than wired up. The split that remains is a real one: Channel is what the video
 * IS, Format is how it's WRITTEN, and the two are edited on completely different
 * schedules — Channel occasionally, Format once per channel from a brief.
 *
 * A client component because tab selection is local UI state with no server round-trip —
 * `page.tsx` stays the server component that fetches the workspace and both initial
 * payloads, and passes them down here as plain props.
 */

const TABS = [
  { id: "channel", label: "Channel", icon: Sparkles, blurb: "Identity, look, voice" },
  { id: "format", label: "Format", icon: Sliders, blurb: "How every script is written" },
  { id: "facts", label: "Facts", icon: BookMarked, blurb: "Sources it may name" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function SettingsTabs({
  channelIdentityProps,
  channelFormatProps,
  channelFactsProps,
}: {
  channelIdentityProps: ChannelIdentitySectionProps;
  channelFormatProps: ChannelFormatSectionProps;
  channelFactsProps: ChannelFactsSectionProps;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("channel");

  return (
    <div>
      {/*
        A segmented control rather than the underlined tab strip this had before. With
        only two destinations an underline reads as decoration on a page this wide; a
        filled pill makes the current section unmistakable from across a 1600px layout,
        and it has room for the one-line blurb that says what each tab actually contains.
      */}
      <div className="mb-8 inline-flex gap-1 rounded-xl border border-ed-border bg-ed-well p-1">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={active}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-left transition-all ${
                active
                  ? "bg-ed-surface shadow-sm text-ed-text"
                  : "text-ed-text-dim hover:text-ed-text"
              }`}
            >
              <Icon size={18} className={active ? "text-ed-accent" : "text-ed-text-faint"} />
              <span>
                <span className="block text-sm font-semibold leading-tight">{tab.label}</span>
                <span className="block text-xs leading-tight text-ed-text-dim">
                  {tab.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Both tabs mount unconditionally, hidden via CSS rather than unmounted, so
          switching tabs never resets in-progress edits — a brief pasted into Format, an
          unsaved rename on Channel. Only the active tab's classes differ. */}
      <div className={activeTab === "channel" ? "block" : "hidden"}>
        <ChannelIdentitySection {...channelIdentityProps} />
      </div>
      <div className={activeTab === "format" ? "block" : "hidden"}>
        <ChannelFormatSection {...channelFormatProps} />
      </div>
      <div className={activeTab === "facts" ? "block" : "hidden"}>
        <ChannelFactsSection {...channelFactsProps} />
      </div>
    </div>
  );
}
