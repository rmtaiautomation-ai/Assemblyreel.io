"use client";

import React from "react";
import { Compass, Headphones, Image as ImageIcon, Sliders, ArrowRight } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: Compass,
      title: "Give the story direction.",
      text: "Enter your topic, target duration, and narrative style. Saved channel blueprints preserve your narrator's persona and visual pacing across every video you produce.",
      highlight: "Channel Blueprints & Brief Setup",
    },
    {
      step: "02",
      icon: Headphones,
      title: "Build and hear each chapter.",
      text: "Review the AI-generated script broken into logical narrative acts. Listen to the spoken voiceover chapter by chapter before committing to visual rendering.",
      highlight: "Voice Review Before Visuals",
    },
    {
      step: "03",
      icon: ImageIcon,
      title: "Bring the scenes to life.",
      text: "Generate thematic visuals, search licensed stock, or upload custom archival assets. Refine any individual scene without regenerating the rest of the project.",
      highlight: "Granular Scene Regeneration",
    },
    {
      step: "04",
      icon: Sliders,
      title: "Polish the timeline and export.",
      text: "Fine-tune scene durations, audio stems, captions, documentary charts, and transitions in the multitrack NLE, then export a crisp 1080p MP4 ready for YouTube.",
      highlight: "Remotion Multitrack NLE",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-[#0D0F13] border-t border-[#20242A]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="max-w-3xl mb-16">
          <div className="mkt-badge mb-3">
            Planned Steps
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            From your brief to an editable video.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            This describes the workflow we are developing. Customer access to narration, visuals, editing, and long-form export is pending.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            return (
              <div
                key={idx}
                className="p-6 sm:p-8 rounded-2xl bg-[#15181C] border border-[#20242A] hover:border-[#353B44] transition-all relative flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-[#20242A] border border-[#353B44]/70 flex items-center justify-center text-[#13EF93] group-hover:scale-105 transition-transform">
                      <Icon size={22} />
                    </div>
                    <span className="text-2xl font-black font-mono text-[#353B44] group-hover:text-[#13EF93]/40 transition-colors">
                      {st.step}
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-[#7FF0BE] uppercase tracking-wider block mb-1">
                    {st.highlight}
                  </span>
                  <h3 className="text-xl font-bold text-[#EDEDEF] mb-3">
                    {st.title}
                  </h3>
                  <p className="text-sm text-[#B5BCC6] leading-relaxed mb-6">
                    {st.text}
                  </p>
                </div>

                <div className="pt-4 border-t border-[#20242A] flex items-center text-xs text-[#9C9EA6] group-hover:text-[#EDEDEF] transition-colors">
                  <span>Phase {idx + 1} Checkpoint</span>
                  <ArrowRight size={14} className="ml-auto text-[#13EF93]" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
