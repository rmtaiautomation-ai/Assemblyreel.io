"use client";

import React, { useState } from "react";
import { GitCommit, SplitSquareVertical, Quote, BarChart3, Info } from "lucide-react";

export default function DocumentaryGraphics() {
  const [activeGraphic, setActiveGraphic] = useState(0);

  const graphicTemplates = [
    {
      title: "Historical Timeline",
      icon: GitCommit,
      category: "Chronological Sequence",
      desc: "Sequence events chronologically with milestone callouts, animated markers, and dates.",
      preview: (
        <div className="space-y-4 p-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="w-16 font-mono text-[#13EF93] font-bold text-[11px]">490 BCE</span>
            <div className="w-2.5 h-2.5 rounded-full bg-[#13EF93] shrink-0" />
            <span className="text-[#EDEDEF]">Battle of Marathon: First Persian invasion repelled</span>
          </div>
          <div className="flex items-center gap-3 pl-8 border-l border-[#353B44] ml-[70px]">
            <span className="text-[11px] text-[#9C9EA6]">Athenian hoplite phalanx breakthrough</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 font-mono text-[#13EF93] font-bold text-[11px]">480 BCE</span>
            <div className="w-2.5 h-2.5 rounded-full bg-[#13EF93] shrink-0" />
            <span className="text-[#EDEDEF]">Thermopylae: The Spartan defense of the narrow pass</span>
          </div>
        </div>
      ),
    },
    {
      title: "Image Comparison",
      icon: SplitSquareVertical,
      category: "Before & After / Archival",
      desc: "Split-screen juxtaposing historical maps, architectural reconstructions, or archaeological site photography.",
      preview: (
        <div className="grid grid-cols-2 gap-3 p-4 text-center text-xs">
          <div className="p-4 rounded-lg bg-[#0E1013] border border-[#20242A]">
            <div className="text-[10px] text-[#9C9EA6] uppercase tracking-wider mb-2">Original Ruins</div>
            <div className="h-16 rounded bg-[#20242A] flex items-center justify-center text-[#B5BCC6] text-[11px]">
              [Archival Photo 1912]
            </div>
            <div className="text-[11px] text-[#EDEDEF] mt-2">Roman Forum Excavation</div>
          </div>
          <div className="p-4 rounded-lg bg-[#0E1013] border border-[#20242A]">
            <div className="text-[10px] text-[#13EF93] uppercase tracking-wider mb-2">3D Architectural Render</div>
            <div className="h-16 rounded bg-[#1F6B4C]/40 border border-[#13EF93]/40 flex items-center justify-center text-[#13EF93] text-[11px]">
              [Reconstruction CAD]
            </div>
            <div className="text-[11px] text-[#EDEDEF] mt-2">Temple of Saturn (Original)</div>
          </div>
        </div>
      ),
    },
    {
      title: "Source Passage / Ledger",
      icon: Quote,
      category: "Documentary Evidence",
      desc: "Highlight translated historical records, archival letters, or quoted manuscripts with typographic reverence.",
      preview: (
        <div className="p-5 text-xs space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-[#13EF93] font-mono">
            Primary Source: Tacitus, The Annals, Book IV
          </div>
          <blockquote className="border-l-2 border-[#13EF93] pl-4 italic text-[#F3F4F6] text-sm leading-relaxed">
            “The government of the provinces remained unaltered: no new tributes were imposed, and the old ones were collected without cruelty or extortion...”
          </blockquote>
          <div className="text-[11px] text-[#9C9EA6] text-right">
            — Translated by A. J. Church and W. J. Brodribb
          </div>
        </div>
      ),
    },
    {
      title: "Documentary Metric & Chart",
      icon: BarChart3,
      category: "Comparative Data",
      desc: "Explain scale, troop sizes, trade volume, or architectural dimensions with animated data points.",
      preview: (
        <div className="p-4 space-y-3 text-xs">
          <div className="text-[11px] text-[#9C9EA6]">Daily Grain Supply to Ancient Rome (Tonnes)</div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#EDEDEF]">Egypt (Alexandria Fleet)</span>
                <span className="font-mono text-[#13EF93]">150,000 t</span>
              </div>
              <div className="h-2 rounded-full bg-[#20242A] overflow-hidden">
                <div className="h-full bg-[#13EF93] rounded-full w-[85%]" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#EDEDEF]">Africa Proconsularis</span>
                <span className="font-mono text-[#7FF0BE]">90,000 t</span>
              </div>
              <div className="h-2 rounded-full bg-[#20242A] overflow-hidden">
                <div className="h-full bg-[#2BBF87] rounded-full w-[55%]" />
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="graphics" className="py-20 md:py-28 bg-[#0D0F13] border-t border-[#20242A]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-16">
          <div className="mkt-badge mb-3">
            Documentary Visual System
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            Give complex ideas a visual explanation.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            These examples illustrate planned timelines, archival quotes, and comparative charts. Customer graphics generation remains unavailable.
          </p>
        </div>

        {/* Graphics selector & visual preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left tabs */}
          <div className="lg:col-span-5 space-y-3">
            {graphicTemplates.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = activeGraphic === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveGraphic(idx)}
                  className={`w-full p-4 rounded-xl text-left border transition-all cursor-pointer flex items-start gap-4 ${
                    isSelected
                      ? "bg-[#1A1D23] border-[#13EF93] shadow-md shadow-[#13EF93]/10"
                      : "bg-[#15181C] border-[#20242A] hover:border-[#353B44]"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? "bg-[#13EF93] text-[#0A0B0D]"
                        : "bg-[#20242A] text-[#B5BCC6]"
                    }`}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#7FF0BE]">
                      {item.category}
                    </div>
                    <div className={`text-sm font-bold ${isSelected ? "text-[#13EF93]" : "text-[#EDEDEF]"}`}>
                      {item.title}
                    </div>
                    <p className="text-xs text-[#9C9EA6] mt-0.5 line-clamp-2">
                      {item.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Preview Frame */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-[#15181C] border border-[#353B44]/70 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#20242A] text-xs">
              <span className="font-semibold text-[#EDEDEF] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#13EF93]" />
                Template Preview: {graphicTemplates[activeGraphic].title}
              </span>
              <span className="text-[10px] font-mono text-[#9C9EA6]">
                Overlay Family (Remotion Composition)
              </span>
            </div>

            <div className="my-4 rounded-xl bg-[#08090B] border border-[#20242A] overflow-hidden min-h-[220px] flex items-center justify-center">
              <div className="w-full">
                {graphicTemplates[activeGraphic].preview}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#9C9EA6] pt-2">
              <Info size={13} className="text-[#13EF93] shrink-0" />
              <span>
                Design examples. These presentation formats are not enabled for customer accounts.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
