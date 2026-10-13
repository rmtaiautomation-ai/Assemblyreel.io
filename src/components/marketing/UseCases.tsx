"use client";

import React from "react";
import { Landmark, GraduationCap, Compass, ArrowRight } from "lucide-react";

export default function UseCases() {
  const cases = [
    {
      icon: Landmark,
      title: "History & Documentary",
      desc: "Construct chapter-based historical narratives with solemn narration, archival imagery, chronological timelines, and reviewed source quotes.",
      sample: "e.g., The Fall of Constantinople, The Silk Road Caravans",
    },
    {
      icon: GraduationCap,
      title: "Educational Explainers",
      desc: "Deconstruct engineering marvels, scientific phenomena, and economic concepts into clear visual explanations with synchronized subtitles and graphs.",
      sample: "e.g., How Deep-Sea Cables Work, The Bretton Woods System",
    },
    {
      icon: Compass,
      title: "Narrative & Video Essays",
      desc: "Develop long-form arguments and philosophical inquiries with sustained narrator voiceover, deliberate scene rhythm, and custom chapter breaks.",
      sample: "e.g., Why Megaprojects Fail, The Evolution of Urban Planning",
    },
  ];

  return (
    <section className="py-20 md:py-28 bg-[#0A0B0D]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <div className="mkt-badge mb-3">
            Planned Formats
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            Built for stories worth watching beyond the first minute.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            These formats guide our development. Customer long-form production remains unavailable.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cases.map((cs, idx) => {
            const Icon = cs.icon;
            return (
              <div
                key={idx}
                className="p-7 rounded-2xl bg-[#15181C] border border-[#20242A] hover:border-[#353B44] transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#20242A] border border-[#353B44]/70 text-[#13EF93] flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                    <Icon size={22} />
                  </div>
                  <h3 className="text-xl font-bold text-[#EDEDEF] mb-3">
                    {cs.title}
                  </h3>
                  <p className="text-sm text-[#B5BCC6] leading-relaxed mb-6">
                    {cs.desc}
                  </p>
                </div>
                <div className="pt-4 border-t border-[#20242A]">
                  <span className="text-xs text-[#7FF0BE] font-medium block">
                    {cs.sample}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
