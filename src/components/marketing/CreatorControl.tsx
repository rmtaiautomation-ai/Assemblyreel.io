"use client";

import React from "react";
import { Headphones, Sliders, RefreshCw, CheckCircle2 } from "lucide-react";

export default function CreatorControl() {
  const controls = [
    {
      icon: Headphones,
      title: "Review before visuals",
      desc: "The planned review step puts script approval before visual generation. Listen to each chapter's narration to confirm pacing, pronunciation, and tone before committing to image rendering.",
    },
    {
      icon: Sliders,
      title: "Refine the edit in real time",
      desc: "Adjust cut points, swap transitions, tweak Remotion captions, or change background music levels on a timeline that behaves like a professional editing suite.",
    },
    {
      icon: RefreshCw,
      title: "Revisit a chapter without restarting",
      desc: "Need to change Scene 8? Re-prompt or swap media for that exact scene without re-generating or re-paying for the preceding 10 minutes of video.",
    },
  ];

  return (
    <section id="control" className="py-20 md:py-28 bg-[#0A0B0D]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Copy & Control Pillars */}
          <div className="lg:col-span-6 space-y-6">
            <div className="mkt-badge">
              Planned Creator Controls
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight leading-tight">
              AI does the heavy lifting. <br />
              <span className="text-[#13EF93]">You keep the final say.</span>
            </h2>
            <p className="text-base text-[#B5BCC6] leading-relaxed">
              Long videos need more than a single Generate button. A 15-minute documentary has dozens of factual nuances, pacing shifts, and editorial choices. The controls below describe our intended workflow and are not yet available to customer accounts.
            </p>

            <div className="space-y-4 pt-4">
              {controls.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-[#15181C] border border-[#20242A] flex items-start gap-4 hover:border-[#353B44] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#20242A] text-[#13EF93] flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#EDEDEF] mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-[#9C9EA6] leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Visual Demonstration of the Control Matrix */}
          <div className="lg:col-span-6 p-6 rounded-2xl bg-[#15181C] border border-[#353B44]/70 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-[#20242A] text-xs font-semibold text-[#EDEDEF]">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#13EF93]" />
                Granular Control Matrix
              </span>
              <span className="font-mono text-[#9C9EA6] text-[11px]">AssemblyReel vs Pure Auto-Posters</span>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="p-3.5 rounded-lg bg-[#0E1013] border border-[#20242A] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#EDEDEF]">Script Verification</div>
                  <div className="text-[11px] text-[#9C9EA6]">Full line editing & chapter reorganization</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-[#13EF93] text-[10px] font-bold border border-[#13EF93]/30">
                  Full Control
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0E1013] border border-[#20242A] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#EDEDEF]">Narration Audition</div>
                  <div className="text-[11px] text-[#9C9EA6]">Hear voice audio before media generation</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-[#13EF93] text-[10px] font-bold border border-[#13EF93]/30">
                  Preview Ready
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0E1013] border border-[#20242A] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#EDEDEF]">Scene Visuals</div>
                  <div className="text-[11px] text-[#9C9EA6]">Per-scene prompt adjustments, stock search, or upload</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-[#13EF93] text-[10px] font-bold border border-[#13EF93]/30">
                  Selective Swap
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0E1013] border border-[#20242A] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#EDEDEF]">Timeline & Overlays</div>
                  <div className="text-[11px] text-[#9C9EA6]">Nonlinear trim, audio volume balance & documentary charts</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-[#13EF93] text-[10px] font-bold border border-[#13EF93]/30">
                  Remotion NLE
                </span>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0E1013] border border-[#20242A] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#EDEDEF]">Publishing Authority</div>
                  <div className="text-[11px] text-[#9C9EA6]">Clean MP4 export to your drive, no surprise uploads</div>
                </div>
                <span className="px-2.5 py-1 rounded bg-emerald-950/80 text-[#13EF93] text-[10px] font-bold border border-[#13EF93]/30">
                  You Decide
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-[#20242A] flex items-center gap-2 text-[11px] text-[#7FF0BE]">
              <CheckCircle2 size={14} className="shrink-0 text-[#13EF93]" />
              Designed to eliminate video generation anxiety and costly failed runs.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
