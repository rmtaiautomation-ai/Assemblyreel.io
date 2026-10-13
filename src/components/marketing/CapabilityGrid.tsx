"use client";

import React from "react";
import { BookOpen, Mic2, ImagePlus, Music, SlidersHorizontal, ImageDown } from "lucide-react";

export default function CapabilityGrid() {
  const capabilities = [
    {
      icon: BookOpen,
      title: "Chapters & Scripting",
      desc: "Turn raw concepts into structured, multi-act narratives with editable scene breakdowns and pacing constraints.",
    },
    {
      icon: Mic2,
      title: "Narration & Captions",
      desc: "Generate professional chapter voiceover with automatic word-level timestamp alignment for dynamic animated subtitles.",
    },
    {
      icon: ImagePlus,
      title: "AI & Stock Visuals",
      desc: "Synthesize image/video assets, search curated stock footage, or upload your own documentary archives.",
    },
    {
      icon: Music,
      title: "Timeline & Audio Stems",
      desc: "Balance voice narration against background music tracks, insert transition sound cues, and adjust scene cut timing.",
    },
    {
      icon: SlidersHorizontal,
      title: "Channel Blueprints",
      desc: "Save your channel's narrator persona, chapter pacing rules, and visual style preferences to reuse across future episodes.",
    },
    {
      icon: ImageDown,
      title: "Thumbnails & Remotion Export",
      desc: "Explore thumbnail concepts and compile your finished timeline into a pristine 1080p MP4 file ready for YouTube.",
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28 bg-[#0D0F13] border-t border-[#20242A]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <div className="mkt-badge mb-3">
            Planned Capabilities
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            The tools behind your next long-form video.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            These are development goals. They are not included with current test accounts, and full customer video generation remains unavailable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div
                key={idx}
                className="p-6 rounded-xl bg-[#15181C] border border-[#20242A] hover:border-[#353B44] hover:bg-[#181B20] transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-10 h-10 rounded-lg bg-[#20242A] border border-[#353B44]/70 text-[#13EF93] flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-[#EDEDEF] mb-2">
                    {cap.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#B5BCC6] leading-relaxed">
                    {cap.desc}
                  </p>
                </div>
                <div className="mt-6 pt-3 border-t border-[#20242A] text-[11px] font-mono text-[#9C9EA6] flex items-center justify-between">
                  <span>Module 0{idx + 1}</span>
                  <span className="text-[#13EF93]">Active</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
