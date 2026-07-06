'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/store/workspaces';
import VoiceCloningModal from '@/components/ui/VoiceCloningModal';

export default function WorkspacesDashboard() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace } = useWorkspaceStore();
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workspaces</h1>
          <p className="text-text-secondary mt-1">Manage your channel profiles and niches</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsVoiceModalOpen(true)}
            className="px-4 py-2 border border-[rgba(255,255,255,0.08)] text-foreground rounded-md hover:bg-bg-glass transition-colors font-medium"
          >
            Voice Cloning Hub
          </button>
          <Link 
            href="/workspaces/new"
            className="bg-accent-primary text-white py-2 px-4 rounded-md font-medium transition-all shadow-[0_2px_10px_var(--accent-glow)] hover:bg-accent-hover hover:-translate-y-[1px] inline-flex items-center justify-center"
          >
            + New Workspace
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces.map((ws) => (
          <div 
            key={ws.id} 
            className={`bg-bg-glass backdrop-blur-md border rounded-xl p-6 transition-all hover:border-[rgba(255,255,255,0.15)] ${activeWorkspaceId === ws.id ? 'border-accent-primary shadow-neon' : 'border-[rgba(255,255,255,0.08)] shadow-glass'}`}
            onClick={() => setActiveWorkspace(ws.id)}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold">{ws.name}</h3>
              {activeWorkspaceId === ws.id && (
                <span className="bg-accent-primary/20 text-accent-primary text-xs px-2 py-1 rounded-full font-medium">Active</span>
              )}
            </div>
            <p className="text-sm text-text-secondary mb-4">{ws.niche}</p>
            
            <div className="space-y-2 mb-4">
              <div className="text-xs">
                <span className="text-text-secondary font-medium">Style: </span>
                <span>{ws.art_style_preset}</span>
              </div>
              <div className="text-xs">
                <span className="text-text-secondary font-medium">Voice: </span>
                <span>{ws.voice_id}</span>
              </div>
            </div>

            <div className="bg-bg-primary/50 p-3 rounded-md border border-[rgba(255,255,255,0.05)]">
              <span className="text-xs text-text-secondary font-medium block mb-1">Master Prompt:</span>
              <p className="text-xs text-foreground line-clamp-3">{ws.master_prompt}</p>
            </div>
          </div>
        ))}
      </div>

      <VoiceCloningModal 
        isOpen={isVoiceModalOpen} 
        onClose={() => setIsVoiceModalOpen(false)} 
      />
    </div>
  );
}
