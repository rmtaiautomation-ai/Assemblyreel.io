"use client";

import React from "react";
import { Copy, Layers, CheckCircle2, Bookmark, Sliders } from "lucide-react";

export default function ChannelConsistency() {
  const blueprintItems = [
    { title: "Voice & Tone", val: "Deep narrative baritone, unhurried 135 wpm cadence" },
    { title: "Chapter Structure", val: "Hook (45s) → 4 Thematic Acts → Synthesis outro" },
    { title: "Visual Direction", val: "Cinematic 35mm film grain, subdued teal-amber grading" },
    { title: "Source & Fact Standards", val: "Archival references, dated maps, verified timestamps" },
  ];

  return (
    <section className="py-20 md:py-28 bg-[#0A0B0D]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Context */}
          <div className="lg:col-span-6 space-y-6">
            <div className="mkt-badge">
              Planned Channel Blueprints
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight leading-tight">
              Build a channel style <br />
              <span className="text-[#13EF93]">you can reuse.</span>
            </h2>
            <p className="text-base text-[#B5BCC6] leading-relaxed">
              This concept would reuse narrator, pacing, story structure, and visual preferences across episodes. Full channel blueprints are not available to customer accounts yet.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {blueprintItems.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-[#15181C] border border-[#20242A]"
                >
                  <div className="text-xs font-semibold text-[#13EF93] mb-1 flex items-center gap-1.5">
                    <Bookmark size={13} />
                    {item.title}
                  </div>
                  <div className="text-xs text-[#EDEDEF]">
                    {item.val}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#9C9EA6] pt-2">
              Illustrative settings only. Current setup testing saves a smaller set of workspace preferences.
            </p>
          </div>

          {/* Right Column: Visual Blueprint Card */}
          <div className="lg:col-span-6 p-6 rounded-2xl bg-[#15181C] border border-[#353B44]/70 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#20242A]">
              <div className="flex items-center gap-2 text-xs font-bold text-[#EDEDEF]">
                <Sliders size={15} className="text-[#13EF93]" />
                Channel Blueprint: Antiquity Explained
              </div>
              <span className="px-2 py-0.5 rounded bg-[#20242A] text-[#13EF93] text-[10px] font-mono">
                Preset v2.4 (Saved)
              </span>
            </div>

            {/* Simulated Project 1 */}
            <div className="p-4 rounded-xl bg-[#0E1013] border border-[#20242A] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#EDEDEF]">Episode 14: The Bronze Age Collapse</span>
                <span className="text-[10px] text-[#7FF0BE] font-mono">16:40 Min • Exported</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#9C9EA6]">
                <CheckCircle2 size={12} className="text-[#13EF93]" /> Inherited narrator Marcus + 4-act structure
              </div>
            </div>

            {/* Simulated Project 2 */}
            <div className="p-4 rounded-xl bg-[#0E1013] border border-[#20242A] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#EDEDEF]">Episode 15: The Siege of Tyre</span>
                <span className="text-[10px] text-[#7FF0BE] font-mono">19:10 Min • Exported</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[#9C9EA6]">
                <CheckCircle2 size={12} className="text-[#13EF93]" /> Same voiceover cadence, grading & motion rules
              </div>
            </div>

            <div className="pt-2 text-center text-xs text-[#9C9EA6]">
              Create multiple channel blueprints for different niches or client brands.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
