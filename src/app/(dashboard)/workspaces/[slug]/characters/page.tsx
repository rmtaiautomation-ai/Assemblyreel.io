"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, Building2, User } from "lucide-react";

export default function SetupIdentityPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [activeTab, setActiveTab] = useState<"ugc" | "custom_business">("custom_business");

  // Custom Business Form State
  const [businessName, setBusinessName] = useState("");
  const [businessInfo, setBusinessInfo] = useState("");
  const [referenceImage, setReferenceImage] = useState<File | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReferenceImage(e.target.files[0]);
    }
  };

  const handleSaveIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Saving identity for", activeTab, {
      businessName,
      businessInfo,
      referenceImage
    });
    // For now, redirect back to the workspace hub after saving
    router.push(`/workspaces/${slug}`);
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link href={`/workspaces/${slug}`} className="btn-secondary px-3 py-2">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Setup Identity</h1>
          <p className="text-text-secondary mt-1">Configure the main identity and context for this workspace.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            className={`flex-1 py-4 px-6 text-center font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === "ugc"
                ? "text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5"
                : "text-text-secondary hover:text-foreground hover:bg-gray-50"
            }`}
            onClick={() => setActiveTab("ugc")}
          >
            <User size={18} />
            UGC (User Generated Content)
          </button>
          <button
            className={`flex-1 py-4 px-6 text-center font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === "custom_business"
                ? "text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5"
                : "text-text-secondary hover:text-foreground hover:bg-gray-50"
            }`}
            onClick={() => setActiveTab("custom_business")}
          >
            <Building2 size={18} />
            Custom Business
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-8">
          {activeTab === "ugc" && (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <User size={32} className="text-text-secondary" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-2">UGC Identity Profiles</h3>
              <p className="text-text-secondary max-w-md mx-auto">
                Configure your digital avatars, voice clones, and personal branding guidelines for User Generated Content.
              </p>
              {/* UGC fields would go here */}
              <div className="mt-8 p-6 bg-gray-50 rounded-xl border border-gray-200 border-dashed">
                <p className="text-sm text-text-secondary">UGC settings coming soon...</p>
              </div>
            </div>
          )}

          {activeTab === "custom_business" && (
            <form onSubmit={handleSaveIdentity} className="flex flex-col gap-6">
              <div>
                <label className="block mb-1 font-semibold text-foreground">Business Name</label>
                <input
                  type="text"
                  placeholder="e.g. Prime Cuts"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none transition-all bg-white text-foreground"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block mb-1 font-semibold text-foreground">Business Information</label>
                <p className="text-text-secondary mb-2 text-sm">Provide details about what the business sells, target audience, and brand tone.</p>
                <textarea
                  placeholder="e.g. Selling premium online steaks, targeting meat lovers..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none transition-all bg-white text-foreground min-h-[120px] resize-y"
                  value={businessInfo}
                  onChange={(e) => setBusinessInfo(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block mb-2 font-semibold text-foreground">Reference Image</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:bg-gray-50 transition-colors relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                    <div className="w-12 h-12 bg-accent-primary/10 rounded-full flex items-center justify-center text-accent-primary">
                      <Upload size={24} />
                    </div>
                    {referenceImage ? (
                      <div className="text-foreground font-medium">{referenceImage.name}</div>
                    ) : (
                      <>
                        <div className="text-foreground font-medium">Click or drag image to upload</div>
                        <div className="text-text-secondary text-sm">Upload a logo or visual reference for the AI</div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button type="submit" className="btn-primary px-8 py-3 text-lg w-full sm:w-auto">
                  Save & Generate AI Video
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
