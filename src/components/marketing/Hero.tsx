"use client";

import React, { useState } from "react";
import { Sparkles, Play, ArrowRight, Layers, Volume2, CheckCircle2, Sliders, Film } from "lucide-react";

interface HeroProps {
  onRequestEarlyAccess: () => void;
}

export default function Hero({ onRequestEarlyAccess }: HeroProps) {
  const [activeTab, setActiveTab] = useState<"brief" | "script" | "timeline">("timeline");

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background radial studio glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-[#13EF93]/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-4xl mx-auto mb-14">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#13EF93]/10 border border-[#13EF93]/25 text-[#13EF93] text-xs font-semibold tracking-wide uppercase mb-6 shadow-sm">
            <Sparkles size={13} className="text-[#13EF93]" />
            AI Video Production for Faceless YouTube Creators
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#F3F4F6] tracking-tight leading-[1.12] mb-5">
            Help shape the future of <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#13EF93] via-[#46f5ae] to-[#7FF0BE]">long-form video</span>.
            <br className="hidden sm:inline" /> Stay in control of the story.
          </h1>

          {/* Body */}
          <p className="text-base sm:text-lg text-[#B5BCC6] leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
            AssemblyReel is developing a workflow for scripting, narration, visuals, and editing.
            Customer video generation is not available yet. Existing testers can log in; paid plans are not on sale.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <button
              onClick={onRequestEarlyAccess}
              className="mkt-btn-primary text-base px-7 py-3.5 w-full sm:w-auto shadow-lg shadow-[#13EF93]/15 font-bold"
            >
              Request Early Access
              <ArrowRight size={18} />
            </button>
            <a
              href="#product"
              className="mkt-btn-secondary text-base px-6 py-3.5 w-full sm:w-auto text-[#EDEDEF]"
            >
              <Play size={16} className="text-[#13EF93] fill-[#13EF93]" />
              View Availability
            </a>
          </div>

          {/* Microcopy reassurance */}
          <p className="text-xs text-[#9C9EA6] tracking-wide">
            Development preview · Access subject to availability · No paid plans on sale
          </p>
        </div>

        <p className="text-center text-sm text-[#B5BCC6] mb-4">Interactive design example. These editing and generation tools are planned for customer access.</p>
        {/* Hero Product Visual Mockup */}
        <div className="relative max-w-5xl mx-auto rounded-2xl p-2 sm:p-3 bg-gradient-to-b from-[#353B44]/80 to-[#15181C] border border-[#353B44]/80 shadow-2xl shadow-black/80">
          <div className="rounded-xl bg-[#0A0B0D] border border-[#20242A] overflow-hidden flex flex-col">
            {/* Top Toolbar / Tab switch */}
            <div className="bg-[#15181C] border-b border-[#20242A] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/60 inline-block" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/60 inline-block" />
                <span className="w-3 h-3 rounded-full bg-green-500/60 inline-block" />
                <span className="ml-3 font-semibold text-[#EDEDEF] text-xs flex items-center gap-1.5">
                  <Film size={13} className="text-[#13EF93]" />
                  Interface concept: How Ancient Rome Engineered Water
                </span>
                <span className="px-2 py-0.5 rounded bg-[#20242A] text-[#9C9EA6] text-[10px]">
                  Target: 14 min
                </span>
              </div>

              {/* Workflow Stepper Navigation in preview */}
              <div className="flex items-center gap-1 bg-[#0A0B0D] p-1 rounded-lg border border-[#20242A]">
                <button
                  onClick={() => setActiveTab("brief")}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    activeTab === "brief"
                      ? "bg-[#20242A] text-white font-medium shadow-sm"
                      : "text-[#9C9EA6] hover:text-white"
                  }`}
                >
                  1. Topic Brief
                </button>
                <button
                  onClick={() => setActiveTab("script")}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    activeTab === "script"
                      ? "bg-[#20242A] text-white font-medium shadow-sm"
                      : "text-[#9C9EA6] hover:text-white"
                  }`}
                >
                  2. Chapters & Voice
                </button>
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`px-2.5 py-1 rounded text-xs transition-all ${
                    activeTab === "timeline"
                      ? "bg-[#13EF93]/15 text-[#13EF93] font-semibold border border-[#13EF93]/30"
                      : "text-[#9C9EA6] hover:text-white"
                  }`}
                >
                  3. Timeline Editor
                </button>
              </div>
            </div>

            {/* Simulated Workspace View based on activeTab */}
            <div className="p-4 sm:p-6 bg-[#0E1013] min-h-[340px] flex flex-col justify-between">
              {activeTab === "brief" && (
                <div className="space-y-4 max-w-2xl mx-auto py-4">
                  <div className="p-4 rounded-xl bg-[#15181C] border border-[#20242A]">
                    <div className="text-[11px] uppercase tracking-wider text-[#13EF93] font-semibold mb-1">
                      Creative Direction
                    </div>
                    <p className="text-sm text-[#F3F4F6] italic">
                      “Create a cinematic documentary explaining how ancient Roman aqueducts maintained continuous slope over miles. Calm authoritative voiceover, chapter-based storytelling, historical map graphics.”
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-[#15181C] border border-[#20242A]">
                      <div className="text-[#9C9EA6] text-[10px]">Channel Blueprint</div>
                      <div className="text-[#EDEDEF] font-medium mt-1">Deep Antiquity (Curated)</div>
                    </div>
                    <div className="grid grid-cols-1 p-3 rounded-lg bg-[#15181C] border border-[#20242A]">
                      <div className="text-[#9C9EA6] text-[10px]">Narration Voice</div>
                      <div className="text-[#EDEDEF] font-medium mt-1">Marcus (Baritone Calm)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#15181C] border border-[#20242A]">
                      <div className="text-[#9C9EA6] text-[10px]">Structure</div>
                      <div className="text-[#EDEDEF] font-medium mt-1">5 Chapters · 4 Acts</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "script" && (
                <div className="space-y-3 py-2">
                  <div className="flex items-center justify-between text-xs text-[#9C9EA6] pb-2 border-b border-[#20242A]">
                    <span>Chapter Breakdown with Creator Approval</span>
                    <span className="text-[#13EF93] flex items-center gap-1">
                      <CheckCircle2 size={12} /> Narration audio ready for review
                    </span>
                  </div>
                  {[
                    { title: "Act 1: The Gradient Miracle", scenes: "3 scenes", dur: "2:45", approved: true },
                    { title: "Act 2: Siphons and Subterranean Arcades", scenes: "5 scenes", dur: "4:10", approved: true },
                    { title: "Act 3: Distribution into the Baths of Caracalla", scenes: "4 scenes", dur: "3:30", approved: false },
                  ].map((ch, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-[#15181C] border border-[#20242A] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded bg-[#20242A] flex items-center justify-center font-bold text-[10px] text-[#13EF93]">
                          {idx + 1}
                        </span>
                        <div>
                          <div className="font-semibold text-[#EDEDEF]">{ch.title}</div>
                          <div className="text-[#9C9EA6] text-[10px]">{ch.scenes} · {ch.dur} runtime</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-2.5 py-1 rounded bg-[#20242A] hover:bg-[#292B30] text-[#EDEDEF] text-[11px] flex items-center gap-1">
                          <Volume2 size={12} className="text-[#13EF93]" /> Listen
                        </button>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                            ch.approved
                              ? "bg-emerald-950 text-[#13EF93] border border-[#13EF93]/30"
                              : "bg-[#292B30] text-[#B5BCC6]"
                          }`}
                        >
                          {ch.approved ? "Approved" : "Review Script"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "timeline" && (
                <div className="space-y-3">
                  {/* Visual preview strip + timeline view */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pb-2">
                    <div className="relative rounded-lg bg-[#15181C] border border-[#20242A] aspect-video overflow-hidden flex items-center justify-center group">
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 z-10" />
                      <div className="absolute top-2 left-2 z-20 bg-black/60 px-1.5 py-0.5 rounded text-[10px] text-[#13EF93] font-mono">
                        01:24 / Scene 3
                      </div>
                      {/* Stylized placeholder representation */}
                      <div className="w-full h-full bg-[#1A1D24] flex flex-col items-center justify-center p-3 text-center">
                        <span className="text-[10px] text-[#7FF0BE] uppercase font-mono tracking-wider">
                          [Graphic: Elevation Profile]
                        </span>
                        <span className="text-xs text-[#EDEDEF] font-semibold mt-1">
                          Pont du Gard — 1:3000 Incline
                        </span>
                      </div>
                      <div className="absolute bottom-2 left-2 right-2 z-20 text-[10px] text-[#B5BCC6] truncate">
                        “Dropping merely 17 meters across a distance of 50 kilometers...”
                      </div>
                    </div>

                    <div className="md:col-span-2 p-3 rounded-lg bg-[#15181C] border border-[#20242A] flex flex-col justify-between">
                      <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[#20242A]">
                        <span className="text-[#EDEDEF] font-semibold flex items-center gap-1.5">
                          <Sliders size={13} className="text-[#13EF93]" />
                          Scene Inspector & Timeline Tracks
                        </span>
                        <span className="text-[10px] text-[#13EF93] font-mono bg-[#13EF93]/10 px-2 py-0.5 rounded border border-[#13EF93]/20">
                          Remotion Ready
                        </span>
                      </div>

                      {/* Mock Multitrack Lanes */}
                      <div className="space-y-2 my-2 text-[10px]">
                        {/* Video Track V1 */}
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[#9C9EA6] font-mono">V1</span>
                          <div className="flex-1 grid grid-cols-4 gap-1 h-6">
                            <div className="bg-purple-950/80 border border-purple-800/60 rounded px-1.5 flex items-center text-purple-200 truncate">
                              Intro Hook
                            </div>
                            <div className="bg-purple-950/80 border border-purple-800/60 rounded px-1.5 flex items-center text-purple-200 truncate">
                              Map: Nîmes
                            </div>
                            <div className="bg-[#1F6B4C] border border-[#13EF93]/60 rounded px-1.5 flex items-center text-white font-medium truncate shadow-sm">
                              Pont du Gard Incline
                            </div>
                            <div className="bg-purple-950/80 border border-purple-800/60 rounded px-1.5 flex items-center text-purple-200 truncate">
                              Underground Channel
                            </div>
                          </div>
                        </div>

                        {/* Audio Track A1 (Narration) */}
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[#9C9EA6] font-mono">A1</span>
                          <div className="flex-1 bg-[#0D1A16] border border-[#1F6B4C] rounded h-6 px-2 flex items-center text-[#7FF0BE] gap-1 overflow-hidden">
                            <Volume2 size={11} className="shrink-0" />
                            <span className="truncate">ElevenLabs / Marcus Voice (Synced Waveform Track)</span>
                          </div>
                        </div>

                        {/* Overlay Track OV */}
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-[#9C9EA6] font-mono">OV</span>
                          <div className="flex-1 grid grid-cols-4 gap-1 h-5">
                            <div className="col-start-2 bg-[#2A1230] border border-[#5B2A66] rounded px-1 flex items-center text-fuchsia-300 truncate">
                              Clean Lower Third
                            </div>
                            <div className="col-start-3 bg-[#2A1230] border border-[#5B2A66] rounded px-1 flex items-center text-fuchsia-300 truncate">
                              Documentary Incline Metric
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#9C9EA6] pt-1 border-t border-[#20242A]">
                        <span>4 tracks synchronized</span>
                        <span className="text-[#EDEDEF]">Export format: 1080p MP4 (Remotion)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom status indicator */}
              <div className="pt-3 border-t border-[#20242A] flex flex-wrap items-center justify-between text-[11px] text-[#9C9EA6]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[#13EF93]">
                    <span className="w-2 h-2 rounded-full bg-[#13EF93] animate-pulse" />
                    Chapter Review Flow Active
                  </span>
                  <span>•</span>
                  <span>Export: High-bitrate 1080p 60fps</span>
                </div>
                <div className="font-mono text-[#B5BCC6]">
                  Production Stage: <strong>Script → Narration → Scenes → Remotion Export</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
