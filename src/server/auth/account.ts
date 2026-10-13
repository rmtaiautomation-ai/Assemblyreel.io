import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authLaunchReady, confirmedIdentity } from "./policy";

export async function verifiedAccount() {
  if (!authLaunchReady()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return !error && confirmedIdentity(data.user) ? data.user : null;
  } catch {
    return null;
  }
}

export async function requireAccount() {
  const user = await verifiedAccount();
  if (!user) redirect("/login?next=/account");
  return user;
}

export async function redirectLegacyPage(): Promise<never> {
  await requireAccount();
  redirect("/account");
}
