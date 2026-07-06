import Link from "next/link";
import React from "react";
import { LayoutGrid, Plug, CreditCard, User } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-[260px] bg-bg-secondary border-r border-gray-200 flex flex-col p-6 z-10">
        <Link href="/" className="flex items-center mb-12 cursor-pointer overflow-hidden w-[220px] h-12 -ml-4">
          <img src="/logo.jpg" alt="Assemblyreels Logo" className="w-full h-full object-contain scale-[3.5] mix-blend-multiply" />
        </Link>

        <nav className="flex flex-col gap-1">
          <Link href="/workspaces" className="flex items-center gap-3 px-3 py-2 text-foreground bg-gray-50 border-l-2 border-accent-primary rounded-r-md transition-all font-medium">
            <LayoutGrid size={18} className="text-accent-primary" />
            Workspaces
          </Link>
          <Link href="/integrations" className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-foreground hover:bg-gray-50 rounded-md transition-all font-medium">
            <Plug size={18} />
            Integrations
          </Link>
          <Link href="/billing" className="flex items-center gap-3 px-3 py-2 text-text-secondary hover:text-foreground hover:bg-gray-50 rounded-md transition-all font-medium">
            <CreditCard size={18} />
            Billing (Credits)
          </Link>
        </nav>

        <div className="mt-auto pt-4 border-t border-gray-200">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
              <User size={16} className="text-text-secondary" />
            </div>
            <div>
              <div className="text-sm font-medium">User Name</div>
              <div className="text-xs text-text-secondary">user@example.com</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <header className="flex justify-end mb-8 relative z-10">
          <div className="bg-white border border-gray-200 shadow-sm rounded-lg px-4 py-2 flex items-center gap-2 transition-all hover:border-accent-primary">
            <span className="text-sm text-text-secondary">Credits:</span>
            <span className="font-semibold text-accent-primary">100</span>
          </div>
        </header>
        
        <div className="relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
