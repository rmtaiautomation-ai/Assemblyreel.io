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
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="heading-1">Create New Workspace</h1>
        <p className="text-muted">Set up a new dedicated environment for a specific video niche.</p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Workspace Name</label>
            <p className="text-muted" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>e.g., "Finance Shorts" or "Tech Reviews"</p>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Enter workspace name" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Default Format Priority</label>
            <p className="text-muted" style={{ marginBottom: '0.5rem', fontSize: '0.85rem' }}>You can still render both types, but this sets your primary layout engine.</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label style={{ cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="format" 
                  value="9:16" 
                  checked={aspectRatio === "9:16"}
                  onChange={() => setAspectRatio("9:16")}
                  style={{ display: 'none' }}
                />
                <div className="glass-panel" style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  border: aspectRatio === "9:16" ? '2px solid var(--accent-primary)' : '2px solid transparent' 
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>9:16 Shorts</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>TikTok, Reels, Shorts</div>
                </div>
              </label>

              <label style={{ cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="format" 
                  value="16:9" 
                  checked={aspectRatio === "16:9"}
                  onChange={() => setAspectRatio("16:9")}
                  style={{ display: 'none' }}
                />
                <div className="glass-panel" style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  border: aspectRatio === "16:9" ? '2px solid var(--accent-primary)' : '2px solid transparent' 
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>16:9 Cinematic</div>
                  <div className="text-muted" style={{ fontSize: '0.85rem' }}>YouTube Long-form</div>
                </div>
              </label>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn-secondary" onClick={() => router.push("/")}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Initialize Workspace
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
