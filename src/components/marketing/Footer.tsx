"use client";

import React from "react";
import Link from "next/link";
import { Film, ArrowRight, Sparkles } from "lucide-react";

interface FooterProps {
  onRequestEarlyAccess: () => void;
}

export default function Footer({ onRequestEarlyAccess }: FooterProps) {
  return (
    <footer className="bg-[#07080A] border-t border-[#20242A] text-[#B5BCC6] text-xs">
      {/* Pre-footer Call to Action Bar */}
      <div className="border-b border-[#20242A] py-16 md:py-20 bg-gradient-to-b from-[#0A0B0D] to-[#07080A]">
        <div className="max-w-4xl mx-auto px-6 text-center space-y-6">
          <div className="mkt-badge mx-auto">
            Follow Our Progress
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold text-[#F3F4F6] tracking-tight">
            Bring your next video idea. <br />
            <span className="text-[#13EF93]">See how the workflow brings it together.</span>
          </h2>
          <p className="text-sm md:text-base text-[#B5BCC6] max-w-xl mx-auto leading-relaxed">
            Tell us about your channel and the long-form content you want to create. Access availability will be confirmed separately.
          </p>
          <div className="pt-2">
            <button
              onClick={onRequestEarlyAccess}
              className="mkt-btn-primary text-sm px-8 py-3.5 shadow-xl shadow-[#13EF93]/15 font-bold"
            >
              <Sparkles size={16} />
              Request Early Access
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
          {/* Brand info */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5 text-white font-bold text-lg tracking-tight">
              <div className="w-8 h-8 rounded-lg bg-[#15181C] border border-[#353B44] flex items-center justify-center text-[#13EF93]">
                <Film size={18} />
              </div>
              <span>Assembly<span className="text-[#13EF93]">Reel</span></span>
            </Link>
            <p className="text-xs text-[#9C9EA6] max-w-sm leading-relaxed">
              A planned workflow for AI-assisted long-form video production. Customer generation and paid plans are not available yet.
            </p>
            <div className="text-[11px] text-[#9C9EA6]">
              Built for faceless YouTube creators, historical documentaries, and deep-dive essayists.
            </div>
          </div>

          {/* Column 1: Product */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#EDEDEF] uppercase tracking-wider">
              Product
            </div>
            <ul className="space-y-2 text-[#9C9EA6]">
              <li><a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a></li>
              <li><a href="#product" className="hover:text-white transition-colors">Sample Export</a></li>
              <li><a href="#control" className="hover:text-white transition-colors">Creator Control</a></li>
              <li><a href="#graphics" className="hover:text-white transition-colors">Documentary Graphics</a></li>
              <li><a href="#features" className="hover:text-white transition-colors">Capability Grid</a></li>
            </ul>
          </div>

          {/* Column 2: Resources & Workspace */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#EDEDEF] uppercase tracking-wider">
              Access
            </div>
            <ul className="space-y-2 text-[#9C9EA6]">
              <li><button onClick={onRequestEarlyAccess} className="hover:text-white transition-colors text-left cursor-pointer">Early Access Cohort</button></li>
              <li><a href="#faq" className="hover:text-white transition-colors">Frequently Asked Questions</a></li>
              <li><Link href="/workspaces" className="hover:text-white transition-colors">Creator Workspace (Login)</Link></li>
              <li><a href="mailto:support@assemblyreel.io" className="hover:text-white transition-colors">Support & Feedback</a></li>
            </ul>
          </div>

          {/* Column 3: Legal & Terms */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#EDEDEF] uppercase tracking-wider">
              Legal
            </div>
            <ul className="space-y-2 text-[#9C9EA6]">
              <li><span className="text-[#7C7F88]">Privacy Notice (Draft)</span></li>
              <li><span className="text-[#7C7F88]">Terms of Service (Draft)</span></li>
              <li><span className="text-[#7C7F88]">Content Provenance Policy</span></li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright row */}
        <div className="mt-12 pt-8 border-t border-[#1C1F24] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#7C7F88]">
          <div>
            AssemblyReel © 2026. All rights reserved.
          </div>
          <div className="flex items-center gap-4">
            <span>Production Studio Theme</span>
            <span>•</span>
            <span className="text-[#9C9EA6]">Remotion NLE Powered</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
