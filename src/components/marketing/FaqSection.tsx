"use client";

import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
        "q": "What is available today?",
        "a": "AssemblyReel is in development. Existing testers can use login when account access is configured. Setup and saved-project testing are limited to enabled test environments. Full customer video generation is not available yet."
    },
    {
        "q": "Are the workflow previews working customer features?",
        "a": "The previews show our planned product direction. Narration, scene generation, timeline editing, thumbnails, and full video exports are not enabled for customer accounts."
    },
    {
        "q": "Does registering interest create an account?",
        "a": "No. A successful interest request records your contact details only. Account registration is available separately when enabled, and requires email confirmation."
    },
    {
        "q": "Can I purchase a subscription?",
        "a": "Paid plans are not on sale. Prices and usage allowances have not been approved. A test account does not include paid generation credits."
    },
    {
        "q": "Can I upload or export media?",
        "a": "Private upload and download flows are being tested in configured test environments. They are not a public video production service. No public sample export is available on this page."
    },
    {
        "q": "How long can videos be, and how fast are they generated?",
        "a": "Customer video duration limits and turnaround times have not been established. The long-form examples describe our goals, not a current service guarantee."
    },
    {
        "q": "Does AssemblyReel publish to YouTube?",
        "a": "Automatic publishing is unavailable. Any future export workflow will need creator review before publication."
    },
    {
        "q": "What kinds of videos are planned?",
        "a": "Our focus is historical documentaries, educational explainers, and narrative video essays. Generated scripts will still need factual and editorial review."
    }
];

  return (
    <section id="faq" className="py-20 md:py-28 bg-[#0A0B0D]">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="mkt-badge mb-3">
            Questions & Clarity
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-base text-[#B5BCC6] leading-relaxed">
            Straightforward answers regarding our workflow, creator control, video durations, and early access.
          </p>
        </div>

        {/* Accessible Accordion list */}
        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-[#15181C] border border-[#20242A] overflow-hidden transition-colors hover:border-[#353B44]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#13EF93]/40"
                >
                  <span className="text-sm md:text-base font-semibold text-[#EDEDEF]">
                    {faq.q}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-lg bg-[#20242A] text-[#13EF93] flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180 bg-[#13EF93]/20" : ""
                    }`}
                  >
                    <ChevronDown size={16} />
                  </div>
                </button>

                {/* Substantive answer is rendered in HTML */}
                <div
                  className={`px-5 pb-5 pt-0 text-xs md:text-sm text-[#B5BCC6] leading-relaxed border-t border-[#20242A]/50 mt-1 ${
                    isOpen ? "block" : "hidden"
                  }`}
                >
                  <p className="pt-3">{faq.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
