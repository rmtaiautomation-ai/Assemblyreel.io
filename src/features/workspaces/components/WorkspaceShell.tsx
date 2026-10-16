import Link from "next/link";
import { LogoutButton } from "@/features/auth/components/LogoutButton";

export function WorkspaceShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#0A0B0D] text-[#F3F4F6] px-5 py-8 sm:px-10">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-[#353B44] pb-6">
        <Link href="/dashboard" className="text-xl font-bold text-[#13EF93]">AssemblyReel</Link>
        <nav aria-label="Workspace navigation" className="flex flex-wrap items-center gap-5 text-sm">
          <Link href="/dashboard">Workspaces</Link><Link href="/account?overview=1">Account settings</Link><LogoutButton />
        </nav>
      </header>
      <h1 className="mt-10 mb-6 text-3xl font-semibold">{title}</h1>
      {children}
    </div>
  </main>;
}
