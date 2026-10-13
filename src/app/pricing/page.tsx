"use client";

import React, { useState } from "react";
import Navbar from "@/components/marketing/Navbar";
import EarlyAccessSection from "@/components/marketing/EarlyAccessSection";
import Footer from "@/components/marketing/Footer";
import EarlyAccessModal from "@/components/marketing/EarlyAccessModal";

export default function PricingPage() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-[#F3F4F6] selection:bg-[#13EF93] selection:text-[#0A0B0D] font-sans flex flex-col">
      <Navbar onRequestEarlyAccess={() => setIsEarlyAccessModalOpen(true)} />

      <main className="flex-1 pt-32 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header */}
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="mkt-badge mb-3">
              Transparent Access Notice
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
              Early Access & Pricing
            </h1>
            <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
              Paid plans are not on sale. Prices, usage allowances, and customer access dates have not been finalized.
            </p>
          </div>

          {/* Pricing Model Explanation Card */}
          <div className="p-8 sm:p-10 rounded-3xl bg-[#15181C] border border-[#353B44]/80 shadow-2xl mb-16 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              <div className="p-5 rounded-2xl bg-[#0E1013] border border-[#20242A] space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#20242A] text-[#13EF93] flex items-center justify-center font-bold">
                  01
                </div>
                <h3 className="text-sm font-bold text-[#EDEDEF]">Pricing Pending</h3>
                <p className="text-[#9C9EA6] leading-relaxed">
                  Prices and included usage will be published once approved. Registering interest does not create a subscription.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0E1013] border border-[#20242A] space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#20242A] text-[#13EF93] flex items-center justify-center font-bold">
                  02
                </div>
                <h3 className="text-sm font-bold text-[#EDEDEF]">Access Pending</h3>
                <p className="text-[#9C9EA6] leading-relaxed">
                  Account and setup flows are being tested. The complete video creation workflow is not open to customers yet.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#0E1013] border border-[#20242A] space-y-2">
                <div className="w-8 h-8 rounded-lg bg-[#20242A] text-[#13EF93] flex items-center justify-center font-bold">
                  03
                </div>
                <h3 className="text-sm font-bold text-[#EDEDEF]">Allowances Pending</h3>
                <p className="text-[#9C9EA6] leading-relaxed">
                  The billing model and usage limits are still under review. No specific video length or generation allowance is included at this stage.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0D1A16] border border-[#1F6B4C] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <div className="text-sm font-bold text-[#13EF93]">
                  Want to evaluate AssemblyReel for your channel?
                </div>
                <div className="text-xs text-[#B5BCC6]">
                  Register your interest below. Availability will be confirmed separately.
                </div>
              </div>
              <button
                onClick={() => setIsEarlyAccessModalOpen(true)}
                className="mkt-btn-primary text-xs px-5 py-2.5 whitespace-nowrap"
              >
                Register Interest
              </button>
            </div>
          </div>

          {/* Form */}
          <EarlyAccessSection id="pricing-early-access" />
        </div>
      </main>

      <Footer onRequestEarlyAccess={() => setIsEarlyAccessModalOpen(true)} />

      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={() => setIsEarlyAccessModalOpen(false)}
      />
    </div>
  );
}
