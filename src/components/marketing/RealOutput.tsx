import Link from "next/link";
import { Film } from "lucide-react";

export default function RealOutput() {
  return (
    <section id="product" className="py-20 md:py-28 bg-[#0D0F13] border-y border-[#20242A]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-3xl mb-12">
          <div className="mkt-badge mb-3">Current Availability</div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[#F3F4F6] tracking-tight mb-4">
            Follow the product as it takes shape.
          </h2>
          <p className="text-base md:text-lg text-[#B5BCC6] leading-relaxed">
            Account access and project setup are being tested. Full video creation,
            editing, and paid subscriptions are not open to customers yet.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 rounded-2xl bg-[#15181C] border border-[#353B44]/70 aspect-video flex flex-col items-center justify-center p-8 text-center gap-4">
            <Film size={40} className="text-[#13EF93]" aria-hidden="true" />
            <h3 className="text-xl font-bold text-[#EDEDEF]">Public video demo pending</h3>
            <p className="text-sm text-[#B5BCC6] max-w-md">
              A reviewed public sample will appear here when available. The interface
              examples on this page illustrate our planned workflow.
            </p>
          </div>
          <div className="lg:col-span-4 p-6 rounded-2xl bg-[#15181C] border border-[#353B44]/70 space-y-4">
            <h3 className="text-lg font-bold text-[#EDEDEF]">Already a tester?</h3>
            <p className="text-sm text-[#B5BCC6]">
              Log in with your existing account. Your account page shows the features
              enabled for your test environment.
            </p>
            <Link href="/login" className="mkt-btn-primary">Log in</Link>
            <p className="text-xs text-[#9C9EA6]">Paid plans are not on sale.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
