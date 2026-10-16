import { existsSync } from "node:fs";
import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });
const checks = [];
const check = (name, passed) => { checks.push({ name, passed: Boolean(passed) }); };
const origin = process.env.NEXT_PUBLIC_SITE_URL;
let validOrigin = false;
try {
  const url = new URL(origin);
  validOrigin = !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash &&
    (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
} catch { /* Report configuration only; never print secret values. */ }
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let publicKey = key?.startsWith("sb_publishable_");
try { publicKey ||= JSON.parse(Buffer.from(key.split(".")[1], "base64url")).role === "anon"; } catch { /* Not a public JWT. */ }
check("Supabase project URL configured", process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("https://"));
check("Public Supabase key is publishable/anon, never service-role", publicKey);
check("Explicit trusted site origin configured", validOrigin);
check("Auth-only stage selected", process.env.APP_ACCESS_STAGE === "auth_only");
check("Phase 0 remote containment explicitly accepted (operator flag)", process.env.AUTH_LAUNCH_READY === "true");
check("Migration files available", existsSync("db/auth/001-auth-only-containment.sql") && existsSync("db/auth/002-account-identities-and-leads.sql"));
for (const { name, passed } of checks) console.log(`${passed ? "PASS" : "PENDING"}: ${name}`);
console.log(`Registration: ${process.env.AUTH_REGISTRATION_ENABLED === "true" ? "requested; verify SMTP/template/migration evidence" : "disabled"}`);
console.log(`Leads: ${process.env.MARKETING_LEADS_ENABLED === "true" ? "requested; verify private storage and service key" : "disabled"}`);
if (process.env.AUTH_RECOVERY_ENABLED === "true") {
  check("Recovery secret configured", (process.env.AUTH_RECOVERY_SECRET?.length ?? 0) >= 32);
  check("Recovery CAPTCHA and provider-controls acceptance configured", process.env.AUTH_CAPTCHA_REQUIRED === "true" &&
    process.env.AUTH_ABUSE_CONTROLS_READY === "true" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  for (const item of checks.slice(-2)) console.log(`${item.passed ? "PASS" : "PENDING"}: ${item.name}`);
}
if (process.env.OWNED_CONTENT_ENABLED === "true" || process.env.PRIVATE_MEDIA_ENABLED === "true") {
  check("Ownership migration explicitly accepted (operator flag)", process.env.OWNERSHIP_MIGRATION_READY === "true");
  console.log(`${checks.at(-1).passed ? "PASS" : "PENDING"}: ${checks.at(-1).name}`);
}
if (process.env.PRIVATE_MEDIA_ENABLED === "true") {
  check("Server-only private storage key configured", process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log(`${checks.at(-1).passed ? "PASS" : "PENDING"}: ${checks.at(-1).name}`);
}
console.log("This checker does not prove remote migrations, SMTP delivery, or Vercel manual acceptance.");
if (process.env.ONBOARDING_ENABLED === "true") {
  check("Onboarding migration 007 available and ownership flags configured", existsSync("db/auth/007-resumable-onboarding.sql") &&
    process.env.OWNERSHIP_MIGRATION_READY === "true" && process.env.OWNED_CONTENT_ENABLED === "true");
  console.log(`${checks.at(-1).passed ? "PASS" : "PENDING"}: ${checks.at(-1).name}; remote 007 acceptance must be checked separately`);
}
if (process.env.WORKSPACE_DASHBOARD_ENABLED === "true") {
  check("Workspace dashboard uses accepted ownership flags", process.env.OWNERSHIP_MIGRATION_READY === "true" && process.env.OWNED_CONTENT_ENABLED === "true");
  console.log(`${checks.at(-1).passed ? "PASS" : "PENDING"}: ${checks.at(-1).name}; live dashboard browser acceptance is separate`);
}
if (process.env.OWNED_EDITOR_ENABLED === "true") {
  check("Owned editor requires reviewed 008 and dashboard ownership flags", process.env.EDITOR_MIGRATION_READY === "true" &&
    process.env.WORKSPACE_DASHBOARD_ENABLED === "true" && process.env.OWNERSHIP_MIGRATION_READY === "true" && process.env.OWNED_CONTENT_ENABLED === "true");
  console.log(`${checks.at(-1).passed ? "PASS" : "PENDING"}: ${checks.at(-1).name}; live rollback SQL and private browser acceptance are separate`);
}
if(process.env.DURABLE_JOBS_ENABLED === "true") {
  check("Job migrations and owned content accepted",process.env.JOBS_MIGRATION_READY === "true" && process.env.OWNED_CONTENT_ENABLED === "true" && process.env.OWNERSHIP_MIGRATION_READY === "true");
  console.log(`${checks.at(-1).passed ? "PASS":"PENDING"}: ${checks.at(-1).name}`);
}
if(process.env.BILLING_MIGRATION_READY === "true") {
  check("Sandbox Stripe mode selected",process.env.BILLING_STRIPE_MODE === "test");
  console.log(`${checks.at(-1).passed ? "PASS":"PENDING"}: ${checks.at(-1).name}`);
}
console.log("Phases 8–10 require separately recorded worker deployment, approved catalog, database paid-resource switch and hosted acceptance; flags alone do not prove them.");
process.exitCode = checks.some(item => !item.passed) ? 1 : 0;
