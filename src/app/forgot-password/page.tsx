import { AuthCard } from "@/features/auth/components/AuthCard";
import { RecoveryForm } from "@/features/auth/components/RecoveryForm";
import { authLaunchReady } from "@/server/auth/policy";
import { recoveryEnabled } from "@/server/auth/mutations";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthCard title="Recover your account">{error && <p role="alert">Recovery link expired or invalid. Request a new email.</p>}
    <RecoveryForm mode="forgot" enabled={authLaunchReady() && recoveryEnabled()} /><Link href="/login" className="block text-sm text-[#13EF93]">Back to login</Link></AuthCard>;
}
