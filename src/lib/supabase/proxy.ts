import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authLaunchReady, confirmedIdentity, onboardingReady, workspaceDashboardReady } from "@/server/auth/policy";

const privateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  // Legacy static output is blocked too; filenames/extensions must not bypass Proxy.
  if (path.startsWith("/media/") || (path.startsWith("/audio/") && !path.startsWith("/audio/transitions/"))) {
    return new NextResponse(null, { status: 404, headers: privateHeaders });
  }
  if (path.startsWith("/api/")) return response; // Each handler enforces its own boundary.

  let confirmed = false;
  if (authLaunchReady() && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    });
    try {
      const { data, error } = await supabase.auth.getUser();
      confirmed = !error && confirmedIdentity(data.user);
    } catch { confirmed = false; }
  }

  const setup = path === "/onboarding" || path.startsWith("/onboarding/");
  const dashboard = path === "/dashboard" || path.startsWith("/dashboard/");
  const legacy = ["/workspaces", "/billing", "/integrations"].some(prefix => path === prefix || path.startsWith(prefix + "/"))
    || (setup && !onboardingReady() && !workspaceDashboardReady()) || (dashboard && !workspaceDashboardReady());
  if (legacy || ((path === "/account" || path.startsWith("/account/") || setup || dashboard) && !confirmed)) {
    const url = request.nextUrl.clone();
    url.pathname = confirmed ? "/account" : "/login";
    url.search = confirmed ? "" : "?next=/account";
    const redirected = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirected.cookies.set(cookie));
    response = redirected;
  }
  // Landing navigation is session-aware; never CDN-cache another person's identity.
  Object.entries(privateHeaders).forEach(([name, value]) => response.headers.set(name, value));
  if (path.startsWith("/auth/")) response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
