import Link from "next/link";
import { AuthCard } from "@/features/auth/components/AuthCard";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { registrationEnabled } from "@/server/auth/policy";

export default function SignupPage() {
  return <AuthCard title="Create your account"><AuthForm mode="signup" enabled={registrationEnabled()} />
    <p className="text-sm">Already have an account? <Link href="/login" className="text-[#13EF93]">Log in</Link></p>
    <p className="text-xs text-[#B5BCC6]">Creating an account does not activate a subscription or video generation.</p>
  </AuthCard>;
}
