import "server-only";

export const LEGACY_UNAVAILABLE = "Service features are unavailable during account-access testing.";

export { legacyServiceEnabled } from "./policy";

export function requireLegacyServiceAvailable(): void {
  // No environment value can reopen an unfinished feature. Later phases replace this
  // with verified identity, ownership and entitlement checks at each boundary.
  throw new Error("FEATURE_UNAVAILABLE: " + LEGACY_UNAVAILABLE);
}

export function legacyFeatureResponse(): Response {
  return Response.json({ error: LEGACY_UNAVAILABLE, code: "FEATURE_UNAVAILABLE" }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
