"use client";

import React, { useState } from "react";
import { Sparkles, CheckCircle2, AlertCircle, ArrowRight, Send } from "lucide-react";

interface EarlyAccessProps {
  id?: string;
}

export default function EarlyAccessSection({ id = "early-access" }: EarlyAccessProps) {
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState<"early_access" | "demo">("early_access");
  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [videoLength, setVideoLength] = useState("10-20m");
  const [challenge, setChallenge] = useState("");
  const [updatesConsent, setUpdatesConsent] = useState(false);

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      // Post to our internal lead API endpoint
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          requestType,
          name,
          channelUrl,
          videoLength,
          challenge,
          updatesConsent,
          submittedAt: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error("Unable to record your request. Please try again.");
      }

      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit request.");
    }
  };

  return (
    <section id={id} className="py-20 md:py-28 bg-[#0D0F13] border-t border-[#20242A]">
      <div className="max-w-4xl mx-auto px-6">
        <div className="p-8 sm:p-12 rounded-3xl bg-[#15181C] border border-[#353B44]/80 shadow-2xl relative overflow-hidden">
          {/* Subtle glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#13EF93]/5 blur-[100px] rounded-full pointer-events-none" />

          <div className="max-w-2xl mx-auto text-center mb-10">
            <div className="mkt-badge mb-3">
              Register Your Interest
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
              Help shape the next stage of AssemblyReel.
            </h2>
            <p className="text-sm sm:text-base text-[#B5BCC6] leading-relaxed">
              Tell us about the videos you want to create. Your request records interest; access and guided walkthrough availability will be confirmed separately.
            </p>
          </div>

          {status === "success" ? (
            <div className="p-8 rounded-2xl bg-[#0E1013] border border-[#13EF93]/40 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#13EF93]/20 text-[#13EF93] flex items-center justify-center mx-auto">
                <CheckCircle2 size={30} />
              </div>
              <h3 className="text-xl font-bold text-[#EDEDEF]">
                Your request has been received.
              </h3>
              <p className="text-sm text-[#B5BCC6] max-w-md mx-auto">
                Your contact email is <strong className="text-white">{email}</strong>. This records your interest; account access and a start date are not guaranteed.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mkt-btn-secondary text-xs px-4 py-2 mt-2"
              >
                Submit another response
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 max-w-xl mx-auto">
              {/* Request Type Radio */}
              <div>
                <label className="block text-xs font-semibold text-[#EDEDEF] uppercase tracking-wider mb-2">
                  What would you like to schedule? <span className="text-[#13EF93]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                      requestType === "early_access"
                        ? "bg-[#1A1D23] border-[#13EF93] text-white"
                        : "bg-[#0E1013] border-[#20242A] text-[#9C9EA6] hover:border-[#353B44]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      checked={requestType === "early_access"}
                      onChange={() => setRequestType("early_access")}
                      className="accent-[#13EF93]"
                    />
                    <span>Early Creator Access</span>
                  </label>
                  <label
                    className={`p-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-colors ${
                      requestType === "demo"
                        ? "bg-[#1A1D23] border-[#13EF93] text-white"
                        : "bg-[#0E1013] border-[#20242A] text-[#9C9EA6] hover:border-[#353B44]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      checked={requestType === "demo"}
                      onChange={() => setRequestType("demo")}
                      className="accent-[#13EF93]"
                    />
                    <span>Guided Workflow Demo</span>
                  </label>
                </div>
              </div>

              {/* Email (Required) */}
              <div>
                <label className="block text-xs font-semibold text-[#EDEDEF] uppercase tracking-wider mb-2">
                  Email Address <span className="text-[#13EF93]">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="creator@youtube.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#0E1013] border border-[#20242A] text-[#EDEDEF] text-sm focus:outline-none focus:border-[#13EF93] focus:ring-1 focus:ring-[#13EF93]/40"
                />
              </div>

              {/* Name & Channel URL (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#9C9EA6] mb-1.5">
                    Your Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Alex"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#0E1013] border border-[#20242A] text-[#EDEDEF] text-sm focus:outline-none focus:border-[#13EF93]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#9C9EA6] mb-1.5">
                    YouTube Channel / Portfolio (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="youtube.com/@channel"
                    value={channelUrl}
                    onChange={(e) => setChannelUrl(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-[#0E1013] border border-[#20242A] text-[#EDEDEF] text-sm focus:outline-none focus:border-[#13EF93]"
                  />
                </div>
              </div>

              {/* Typical Video Duration (Optional) */}
              <div>
                <label className="block text-xs text-[#9C9EA6] mb-1.5">
                  Target Video Runtime (Optional)
                </label>
                <select
                  value={videoLength}
                  onChange={(e) => setVideoLength(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0E1013] border border-[#20242A] text-[#EDEDEF] text-sm focus:outline-none focus:border-[#13EF93]"
                >
                  <option value="5-10m">5 to 10 Minutes</option>
                  <option value="10-20m">10 to 20 Minutes (Standard Documentary)</option>
                  <option value="20m+">20+ Minutes (Deep Dive Essay)</option>
                </select>
              </div>

              {/* Main production challenge (Optional) */}
              <div>
                <label className="block text-xs text-[#9C9EA6] mb-1.5">
                  Biggest Production Bottleneck Today (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Script pacing, matching visuals to long voiceover, editing fatigue..."
                  value={challenge}
                  onChange={(e) => setChallenge(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[#0E1013] border border-[#20242A] text-[#EDEDEF] text-sm focus:outline-none focus:border-[#13EF93]"
                />
              </div>

              {/* Optional updates consent */}
              <label className="flex items-center gap-2.5 text-xs text-[#9C9EA6] cursor-pointer">
                <input
                  type="checkbox"
                  checked={updatesConsent}
                  onChange={(e) => setUpdatesConsent(e.target.checked)}
                  className="accent-[#13EF93] rounded"
                />
                <span>Keep me posted on product changelogs and workflow guides.</span>
              </label>

              {status === "error" && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle size={15} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="mkt-btn-primary w-full py-3.5 text-sm font-bold justify-center disabled:opacity-50"
              >
                {status === "submitting" ? (
                  "Sending Request..."
                ) : (
                  <>
                    <Send size={15} />
                    Send Request
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-[#9C9EA6]">
                Public plans and allowances will be shared when finalized. No card required to request early access.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
