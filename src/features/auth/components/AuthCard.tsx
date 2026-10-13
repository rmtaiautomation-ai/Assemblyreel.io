import Link from "next/link";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-[#0A0B0D] text-[#F3F4F6] px-5 py-16 flex items-center justify-center">
    <section className="w-full max-w-md rounded-2xl border border-[#353B44] bg-[#15181C] p-7 sm:p-9 space-y-6">
      <Link href="/" className="text-[#13EF93] font-bold">AssemblyReel</Link>
      <h1 className="text-2xl font-bold">{title}</h1>{children}
    </section>
  </main>;
}
