function configured(value) {
  return typeof value === "string"
    && value.trim().length > 0
    && !/dummy|placeholder|changeme|your[_-]|replace[_-]/i.test(value);
}

function stripeMode(value, prefix) {
  if (!configured(value)) return null;
  const match = new RegExp(`^${prefix}_(test|live)_[A-Za-z0-9]+$`).exec(value.trim());
  return match?.[1] ?? null;
}

function validOrigin(value) {
  if (!configured(value)) return false;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (url.protocol === "https:" || (local && url.protocol === "http:"))
      && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === "/";
  } catch {
    return false;
  }
}

function jwtRole(value) {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

// Format checks only. No network requests, SDK initialization, or secret values
// in the returned report. A pass is not proof of valid keys or isolated staging.
export function inspectBillingEnvironment(environment) {
  const secretMode = stripeMode(environment.STRIPE_SECRET_KEY, "(?:sk|rk)");
  const publicMode = stripeMode(environment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "pk");
  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const adminKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  const checks = [
    {
      name: "NEXT_PUBLIC_SUPABASE_URL",
      pass: validOrigin(environment.NEXT_PUBLIC_SUPABASE_URL),
      detail: "Requires HTTPS or a loopback HTTP origin without credentials, paths, or query parameters.",
    },
    {
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      pass: configured(anonKey)
        && (/^sb_publishable_[A-Za-z0-9_-]+$/.test(anonKey) || jwtRole(anonKey) === "anon"),
      detail: "Requires a public key format; never put a service-role/secret key in a NEXT_PUBLIC variable.",
    },
    {
      name: "SUPABASE_SERVICE_ROLE_KEY",
      pass: configured(adminKey)
        && (/^sb_secret_[A-Za-z0-9_-]+$/.test(adminKey) || jwtRole(adminKey) === "service_role"),
      detail: "Requires a server-only admin key format; privileges are not verified offline.",
    },
    {
      name: "STRIPE_SECRET_KEY",
      pass: secretMode === "test",
      detail: "Phase 0 requires a test-mode secret/restricted key, not a live or placeholder key.",
    },
    {
      name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      pass: publicMode === "test",
      detail: "Phase 0 requires a test-mode publishable key.",
    },
    {
      name: "STRIPE_KEY_MODE_MATCH",
      pass: secretMode !== null && secretMode === publicMode,
      detail: "Secret and publishable key modes must match; matching formats do not prove the same Stripe account.",
    },
    {
      name: "STRIPE_WEBHOOK_SECRET",
      pass: configured(environment.STRIPE_WEBHOOK_SECRET)
        && /^whsec_[A-Za-z0-9]+$/.test(environment.STRIPE_WEBHOOK_SECRET.trim()),
      detail: "Requires a webhook signing-secret format; the endpoint/CLI listener must be verified separately.",
    },
    {
      name: "NEXT_PUBLIC_SITE_URL",
      pass: validOrigin(environment.NEXT_PUBLIC_SITE_URL),
      detail: "Configure an explicit local/staging return origin before wiring checkout.",
    },
  ];

  return {
    configurationPass: checks.every((check) => check.pass),
    stripeMode: secretMode ?? "unknown",
    checks,
    outstanding: [
      "Separate staging Supabase and Stripe test account/project confirmation.",
      "Read-only schema, auth trigger, grants, RLS and storage-policy review.",
      "Approved resource allowances, provider costs and commercial terms.",
      "Stripe products, price mappings, portal settings and endpoint/API-version verification.",
    ],
  };
}
