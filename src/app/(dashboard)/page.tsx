"use client";

import Link from "next/link";
import React from "react";
import { useWorkspaceStore } from "@/store/workspaces";
import { Plus, LayoutGrid, FileVideo, Users, FolderOpen } from "lucide-react";

export default function DashboardHome() {
  const workspaces = useWorkspaceStore((state) => state.workspaces);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="heading-1">Workspaces</h1>
          <p className="text-muted mt-1">Manage your niche video channels and sub-accounts.</p>
        </div>
        <Link href="/workspaces/new" className="btn-primary">
          <Plus size={16} className="mr-2" />
          New Workspace
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 py-24 glass-panel border-dashed border-2 border-gray-200">
          <div className="w-16 h-16 rounded-full bg-accent-glow flex items-center justify-center mb-4">
            <FolderOpen size={32} className="text-accent-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">No workspaces yet</h2>
          <p className="text-muted text-center max-w-md mb-6">
            Create your first workspace to start generating automated video content, managing voice actors, and building your audience.
          </p>
          <Link href="/workspaces/new" className="btn-primary">
            <Plus size={16} className="mr-2" />
            Create Workspace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((ws) => (
            <div key={ws.id} className="glass-panel p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div style={{ 
                    width: '48px', 
                    height: '48px', 
                    borderRadius: '12px', 
                    background: `linear-gradient(135deg, ${ws.colorPrimary || '#1d4ed8'}, ${ws.colorSecondary || '#60a5fa'})`,
                    boxShadow: `0 0 20px ${ws.colorPrimary || '#1d4ed8'}40`
                  }} className="flex items-center justify-center shrink-0">
                    <LayoutGrid className="text-white opacity-90" size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground tracking-tight">{ws.name}</h3>
                    <span className="text-xs inline-flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md mt-1 text-text-secondary border border-gray-200">
                      {ws.aspectRatio === '9:16' ? '📱 9:16 Shorts' : '🎬 16:9 Cinematic'}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-2 pt-4 border-t border-gray-100">
                <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100 transition-colors hover:border-gray-200">
                  <div className="text-muted flex items-center gap-1.5 mb-1 text-xs uppercase tracking-wider font-medium">
                    <FileVideo size={14} className="text-accent-primary" /> Videos
                  </div>
                  <div className="text-2xl font-semibold text-foreground">{ws.videoCount || 0}</div>
                </div>
                <div className="flex-1 bg-gray-50 rounded-lg p-3 border border-gray-100 transition-colors hover:border-gray-200">
                  <div className="text-muted flex items-center gap-1.5 mb-1 text-xs uppercase tracking-wider font-medium">
                    <Users size={14} className="text-accent-primary" /> Characters
                  </div>
                  <div className="text-2xl font-semibold text-foreground">{ws.characterCount || 0}</div>
                </div>
              </div>

              <Link href={`/workspaces/${ws.slug}`} className="btn-secondary w-full mt-3">
                Enter Workspace
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
