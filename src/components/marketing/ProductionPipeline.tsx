"use client";

import React, { useState } from "react";
import { Sparkles, FileText, Mic, Image as ImageIcon, Sliders, Download, Check, ArrowRight } from "lucide-react";

export default function ProductionPipeline() {
  const [activeStage, setActiveStage] = useState(0);

  const stages = [
    {
      title: "1. Topic Brief",
      icon: Sparkles,
      desc: "Specify your narrative hook, duration target, and channel tone.",
      details: "Enter a topic prompt or outline. AssemblyReel applies your saved channel blueprint (voice, cadence, visual identity) to frame the scope of the video.",
      creatorRole: "Sets topic, target length, and channel blueprint.",
    },
    {
      title: "2. Script & Chapters",
      icon: FileText,
      desc: "AI organizes the story into acts and reviewable chapters.",
      details: "Long-form content is structured scene by scene with dedicated scene descriptions, pacing rules, and narration cues rather than a single uninterrupted wall of text.",
      creatorRole: "Audits the chapter flow and edits scene script lines before voice generation.",
    },
    {
      title: "3. Narration Audio",
      icon: Mic,
      desc: "Generates spoken audio and synchronizes word-level timestamps.",
      details: "Voices are synthesized via configured providers (ElevenLabs / OpenAI) with word-level alignment tracks built for caption rendering.",
      creatorRole: "Listens to chapter audio; regenerates or re-records scenes as needed.",
    },
    {
      title: "4. Visual Assets",
      icon: ImageIcon,
      desc: "Pairs scenes with AI visuals, stock clips, or custom uploads.",
      details: "Scenes receive matching imagery from AI generation, searched stock libraries, or your uploaded documentary assets with casting consistency blueprints.",
      creatorRole: "Replaces off-tone clips or supplies proprietary reference media.",
    },
    {
      title: "5. Multitrack Timeline",
      icon: Sliders,
      desc: "Inspect scenes, transitions, documentary graphics, and audio.",
      details: "A dedicated NLE workspace lets you adjust scene durations, layer documentary lower-thirds, refine transitions, and balance background audio.",
      creatorRole: "Trims cuts, adds overlays, and checks pacing in real time.",
    },
    {
      title: "6. Remotion Export",
      icon: Download,
      desc: "Renders clean 1080p MP4 ready for YouTube upload.",
      details: "Cloud or local Remotion render engine compiles tracks, motion graphics, audio waveforms, and captions into a high-bitrate video file.",
      creatorRole: "Downloads final MP4; retains total publishing authority.",
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-[#0A0B0D]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="mkt-badge mb-3">
            Planned Production Workflow
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            One idea. A complete production workflow.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            Writing, voiceover, visuals, and editing usually mean juggling four different tools.
            The stages below describe our planned workflow. Full customer generation and export remain unavailable.
          </p>
        </div>

        {/* 6-Stage Timeline Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          {stages.map((stg, idx) => {
            const Icon = stg.icon;
            const isSelected = activeStage === idx;
            return (
              <button
                key={idx}
                onClick={() => setActiveStage(idx)}
                className={`p-4 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between min-h-[110px] ${
                  isSelected
                    ? "bg-[#1A1D23] border-[#13EF93] shadow-lg shadow-[#13EF93]/10"
                    : "bg-[#15181C] border-[#20242A] hover:border-[#353B44] hover:bg-[#181B20]"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? "bg-[#13EF93] text-[#0A0B0D]"
                        : "bg-[#20242A] text-[#B5BCC6]"
                    }`}
                  >
                    <Icon size={16} />
                  </div>
                  <span className="text-[10px] font-mono text-[#9C9EA6]">
                    0{idx + 1}
                  </span>
                </div>
                <div>
                  <div className={`text-xs font-bold leading-tight ${isSelected ? "text-[#13EF93]" : "text-[#EDEDEF]"}`}>
                    {stg.title.replace(/^\d+\.\s*/, "")}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Stage Deep Dive Card */}
        <div className="p-6 md:p-8 rounded-2xl bg-[#15181C] border border-[#353B44]/60 shadow-xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-[#13EF93] bg-[#13EF93]/10 px-2.5 py-1 rounded border border-[#13EF93]/20">
                Stage {activeStage + 1} of 6: {stages[activeStage].title}
              </div>
              <h3 className="text-xl md:text-2xl font-bold text-[#EDEDEF]">
                {stages[activeStage].desc}
              </h3>
              <p className="text-sm md:text-base text-[#B5BCC6] leading-relaxed">
                {stages[activeStage].details}
              </p>
            </div>

            <div className="md:col-span-5 p-5 rounded-xl bg-[#0E1013] border border-[#20242A] space-y-3">
              <div className="text-xs font-bold text-[#EDEDEF] uppercase tracking-wider flex items-center gap-2">
                <Check size={14} className="text-[#13EF93]" />
                Where You Retain Control:
              </div>
              <p className="text-xs text-[#9C9EA6] leading-relaxed">
                {stages[activeStage].creatorRole}
              </p>
              <div className="pt-2 border-t border-[#20242A] text-[11px] text-[#7FF0BE]">
                No unattended publishing promise. You audit every chapter before final render.
              </div>
            </div>
          </div>
        </div>

        {/* Supporting Quote line */}
        <p className="text-center text-xs text-[#9C9EA6] mt-8">
          AI handles the mechanical heavy lifting. You supply the editorial direction and approval.
        </p>
      </div>
    </section>
  );
}
