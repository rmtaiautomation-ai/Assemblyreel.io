import { redirectLegacyPage } from "@/server/auth/account";

export default async function DashboardLayout() {
  return redirectLegacyPage();
}
