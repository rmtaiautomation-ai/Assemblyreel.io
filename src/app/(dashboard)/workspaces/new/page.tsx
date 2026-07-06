"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceStore } from "@/store/workspaces";

export default function NewWorkspacePage() {
  const router = useRouter();
  const addWorkspace = useWorkspaceStore((state) => state.addWorkspace);
  const [name, setName] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    
    const mockSlug = name.toLowerCase().replace(/ /g, '-');
    
    // Add to our global UI state so it shows up on the dashboard
    addWorkspace({
      name,
      slug: mockSlug,
      aspectRatio
    });

    console.log("Creating workspace:", { name, aspectRatio });
    // Mock redirect to the new Studio Hub
    router.push(`/workspaces/${mockSlug}`);
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Create New Workspace</h1>
        <p className="text-text-secondary mt-1">Set up a new dedicated environment for a specific video niche.</p>
      </div>

      <div className="bg-white border border-gray-100 p-8 rounded-2xl shadow-sm">
        <form onSubmit={handleCreate} className="flex flex-col gap-8">
          
          <div>
            <label className="block mb-1 font-semibold text-foreground">Workspace Name</label>
            <p className="text-text-secondary mb-3 text-sm">e.g., "Finance Shorts" or "Tech Reviews"</p>
            <input 
              type="text" 
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 outline-none transition-all bg-white text-foreground" 
              placeholder="Enter workspace name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block mb-1 font-semibold text-foreground">Default Format Priority</label>
            <p className="text-text-secondary mb-4 text-sm">You can still render both types, but this sets your primary layout engine.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="cursor-pointer">
                <input 
                  type="radio" 
                  name="format" 
                  value="9:16" 
                  checked={aspectRatio === "9:16"}
                  onChange={() => setAspectRatio("9:16")}
                  className="hidden"
                />
                <div className={`p-6 text-center rounded-xl border-2 transition-all ${
                  aspectRatio === "9:16" ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <div className="text-xl font-bold text-foreground mb-1">9:16 Shorts</div>
                  <div className="text-text-secondary text-sm">TikTok, Reels, Shorts</div>
                </div>
              </label>

              <label className="cursor-pointer">
                <input 
                  type="radio" 
                  name="format" 
                  value="16:9" 
                  checked={aspectRatio === "16:9"}
                  onChange={() => setAspectRatio("16:9")}
                  className="hidden"
                />
                <div className={`p-6 text-center rounded-xl border-2 transition-all ${
                  aspectRatio === "16:9" ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <div className="text-xl font-bold text-foreground mb-1">16:9 Cinematic</div>
                  <div className="text-text-secondary text-sm">YouTube Long-form</div>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 mt-2">
            <button type="button" className="btn-secondary px-6 py-2" onClick={() => router.push("/workspaces")}>
              Cancel
            </button>
            <button type="submit" className="btn-primary px-6 py-2">
              Initialize Workspace
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
