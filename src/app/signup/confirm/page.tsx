import Link from "next/link";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { registrationEnabled } from "@/server/auth/policy";

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthCard title="Check your email">
    {error && <p role="alert" className="text-red-300 text-sm">This confirmation link is invalid, expired, or already used. Request a new email below.</p>}
    <p className="text-sm text-[#B5BCC6]">If your address is eligible, you’ll receive a confirmation link. Check your spam folder. If you already confirmed your account, log in.</p>
    <AuthForm mode="resend" enabled={registrationEnabled()} />
    <Link href="/login" className="block text-[#13EF93] text-sm">Back to login</Link>
  </AuthCard>;
}
