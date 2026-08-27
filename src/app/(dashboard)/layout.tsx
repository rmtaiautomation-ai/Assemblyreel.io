"use client";

import Link from "next/link";
import React, { useState } from "react";
import { LayoutGrid, Plug, CreditCard, User, ChevronLeft, ChevronRight, Plus, Settings, LogOut } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <div className="ed-app flex h-screen overflow-hidden bg-ed-base text-ed-text">
      {/* Sidebar */}
      <aside 
        className={`${isMinimized ? 'w-[80px]' : 'w-[260px]'} bg-ed-chrome border-r border-ed-border flex flex-col p-6 z-10 transition-all duration-300 relative shrink-0`}
      >
        {/* Collapse Toggle Button */}
        <button 
          onClick={() => setIsMinimized(!isMinimized)}
          className="absolute -right-3 top-8 bg-ed-surface border border-ed-border-strong text-ed-text-dim hover:text-ed-accent-text hover:border-ed-border-strong rounded-full p-1 z-20 shadow-sm transition-colors"
          title={isMinimized ? "Expand Sidebar" : "Minimize Sidebar"}
        >
          {isMinimized ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="h-4"></div>



        <nav className="flex flex-col gap-1">
          <Link href="/workspaces" className={`flex items-center gap-3 py-2.5 text-ed-text bg-ed-accent-soft border-l-2 border-ed-accent rounded-r-md transition-all font-medium group ${isMinimized ? 'justify-center px-0' : 'px-3'}`} title="Workspaces">
            <LayoutGrid size={18} className="text-ed-accent-text shrink-0" />
            {!isMinimized && <span className="truncate">Workspaces</span>}
          </Link>
          <Link href="/integrations" className={`flex items-center gap-3 py-2.5 text-ed-text-dim hover:text-ed-text hover:bg-ed-hover rounded-md transition-all font-medium border-l-2 border-transparent group ${isMinimized ? 'justify-center px-0' : 'px-3'}`} title="Integrations">
            <Plug size={18} className="shrink-0" />
            {!isMinimized && <span className="truncate">Integrations</span>}
          </Link>
          <Link href="/billing" className={`flex items-center gap-3 py-2.5 text-ed-text-dim hover:text-ed-text hover:bg-ed-hover rounded-md transition-all font-medium border-l-2 border-transparent group ${isMinimized ? 'justify-center px-0' : 'px-3'}`} title="Billing">
            <CreditCard size={18} className="shrink-0" />
            {!isMinimized && <span className="truncate">Billing (Credits)</span>}
          </Link>
        </nav>

        <div className="mt-auto pt-4 border-t border-ed-border">
          <div className={`flex items-center justify-between ${isMinimized ? 'justify-center' : 'px-2'}`}>
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-ed-accent-soft border border-ed-accent-border flex items-center justify-center shrink-0" title="User Profile">
                <User size={16} className="text-ed-accent-text" />
              </div>
              {!isMinimized && (
                <div className="overflow-hidden">
                  <div className="text-sm font-semibold truncate text-ed-text">User Name</div>
                  <div className="text-xs text-ed-text-faint truncate">user@example.com</div>
                </div>
              )}
            </div>
            
            {!isMinimized && (
              <div className="relative">
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="text-ed-text-faint hover:text-ed-text transition-colors p-1.5 rounded-md hover:bg-ed-hover shrink-0 ml-2"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>
                
                {isDropdownOpen && (
                  <div className="absolute bottom-full right-0 mb-2 w-36 bg-ed-raised border border-ed-border rounded-md shadow-lg py-1 z-50">
                    <button
                      onClick={() => {
                        document.cookie = "demo_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                        window.location.href = '/';
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-ed-danger hover:bg-ed-danger-soft flex items-center gap-2"
                    >
                      <LogOut size={14} />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto ed-scroll p-8 relative">
        <div className="relative z-10 h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
