import Link from "next/link";
import { requireAccount } from "@/server/auth/account";
import { billingLaunchReady } from "@/server/access/launch";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { AccountBillingPanel } from "@/features/billing/AccountBillingPanel";
export const dynamic="force-dynamic";
export default async function BillingPage({searchParams}:{searchParams:Promise<{checkout?:string}>}) {
  const user=await requireAccount();const {checkout}=await searchParams;
  return <AuthCard title="Your billing"><p className="text-sm break-all">Signed in as {user.email}</p>
    {billingLaunchReady()?<AccountBillingPanel returnState={checkout==="returned"||checkout==="canceled"?checkout:undefined}/>:<p>Sandbox billing is awaiting configuration.</p>}
    <Link href="/account?overview=1" className="text-[#13EF93]">Back to account</Link></AuthCard>;
}
