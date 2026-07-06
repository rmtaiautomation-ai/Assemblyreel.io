"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function WorkspaceHubPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  
  // Mock data for the UI
  const workspaceName = slug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Header Area */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
            <button className="btn-secondary" onClick={() => router.push("/")} style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
              &larr; All Workspaces
            </button>
            <span style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: '600', padding: '0.2rem 0.6rem', background: 'var(--accent-glow)', borderRadius: '12px' }}>
              Studio Active
            </span>
          </div>
          <h1 className="heading-1">{workspaceName}</h1>
          <p className="text-muted">Manage your AI video pipeline for this channel.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href={`/workspaces/${slug}/settings`} className="btn-secondary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '8px' }}>
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Studio Settings
          </Link>
          <Link href={`/workspaces/${slug}/videos/new`} className="btn-primary" style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none' }}>
            + Generate Video
          </Link>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem' }}>
        
        {/* Quick Action: Setup Character */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', border: '1px solid var(--accent-primary)' }}>
          <div>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            </div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Character Library</h3>
            <p className="text-muted" style={{ fontSize: '0.9rem' }}>You haven't set up a permanent avatar and voice for this channel yet.</p>
          </div>
          <Link href={`/workspaces/${slug}/characters`} className="btn-secondary" style={{ marginTop: '1.5rem', textAlign: 'center', width: '100%' }}>
            Setup Identity &rarr;
          </Link>
        </div>

        {/* Stats */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Videos Generated</h3>
            <div style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}>0</div>
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>Credits Used</h3>
            <div style={{ fontSize: '1.5rem', fontWeight: '600' }}>0</div>
          </div>
        </div>

        {/* Recent Videos List */}
        <div className="glass-panel" style={{ padding: '1.5rem', gridRow: 'span 2' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1.5rem' }}>Recent Video Projects</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', textAlign: 'center' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>
            </div>
            <p className="text-muted" style={{ marginBottom: '1rem' }}>No videos generated yet in this studio.</p>
            <button className="btn-primary">Generate First Video</button>
          </div>
        </div>

      </div>
    </div>
  );
}
