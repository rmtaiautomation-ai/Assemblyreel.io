"use client";

import React, { useState } from "react";
import Navbar from "@/components/marketing/Navbar";
import Hero from "@/components/marketing/Hero";
import RealOutput from "@/components/marketing/RealOutput";
import ProductionPipeline from "@/components/marketing/ProductionPipeline";
import HowItWorks from "@/components/marketing/HowItWorks";
import CreatorControl from "@/components/marketing/CreatorControl";
import CapabilityGrid from "@/components/marketing/CapabilityGrid";
import ChannelConsistency from "@/components/marketing/ChannelConsistency";
import DocumentaryGraphics from "@/components/marketing/DocumentaryGraphics";
import UseCases from "@/components/marketing/UseCases";
import EarlyAccessSection from "@/components/marketing/EarlyAccessSection";
import FaqSection from "@/components/marketing/FaqSection";
import Footer from "@/components/marketing/Footer";
import EarlyAccessModal from "@/components/marketing/EarlyAccessModal";

export default function LandingPage() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);

  const openEarlyAccess = () => {
    setIsEarlyAccessModalOpen(true);
  };

  const closeEarlyAccess = () => {
    setIsEarlyAccessModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-[#F3F4F6] selection:bg-[#13EF93] selection:text-[#0A0B0D] font-sans flex flex-col">
      {/* Studio Navigation Bar */}
      <Navbar onRequestEarlyAccess={openEarlyAccess} />

      {/* Main Page Flow */}
      <main className="flex-1">
        {/* 1. Hero with interactive studio mockup */}
        <Hero onRequestEarlyAccess={openEarlyAccess} />

        {/* 2. Real output video showcase with provenance data */}
        <RealOutput />

        {/* 3. 6-Stage Production Pipeline with creator checkpoints */}
        <ProductionPipeline />

        {/* 4. How It Works: 4 Linear Steps */}
        <HowItWorks />

        {/* 5. Creator Control & Verification Checkpoints */}
        <CreatorControl />

        {/* 6. Core Capability Grid */}
        <CapabilityGrid />

        {/* 7. Channel Blueprints & Visual Cohesion */}
        <ChannelConsistency />

        {/* 8. Documentary Graphics (Timeline, Comparison, Quotes, Charts) */}
        <DocumentaryGraphics />

        {/* 9. Use Cases: History, Education, Essays */}
        <UseCases />

        {/* 10. Embedded Early Access Request Section */}
        <EarlyAccessSection id="early-access" />

        {/* 11. FAQ Accordion with substantive answers in HTML */}
        <FaqSection />
      </main>

      {/* 12. Pre-footer CTA & Links Footer */}
      <Footer onRequestEarlyAccess={openEarlyAccess} />

      {/* Interactive Modal triggered by CTA buttons */}
      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={closeEarlyAccess}
      />
    </div>
  );
}
