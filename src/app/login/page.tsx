import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { verifiedAccount } from "@/server/auth/account";
import { authLaunchReady, registrationEnabled, safeReturnPath } from "@/server/auth/policy";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await verifiedAccount()) redirect("/account");
  const params = await searchParams;
  return <AuthCard title="Log in to your account"><AuthForm mode="login" next={safeReturnPath(params.next)} enabled={authLaunchReady()} />
    <Link className="text-sm text-[#13EF93] block" href="/forgot-password">Forgot your password?</Link>
    {registrationEnabled() && <p className="text-sm">New here? <Link className="text-[#13EF93]" href="/signup">Create an account</Link></p>}
  </AuthCard>;
}
