export const actorId = "10000000-0000-4000-8000-000000000001";
export const otherActorId = "10000000-0000-4000-8000-000000000002";
export const accountId = "20000000-0000-4000-8000-000000000001";
export const resourceId = "30000000-0000-4000-8000-000000000001";
export const operationId = "40000000-0000-4000-8000-000000000001";
export const now = Date.parse("2026-10-06T08:00:00Z");
export const account = { id: accountId, ownerId: actorId, enabled: true, stripeMode: "test", stripeCustomerId: "cus_fixture" };
export const snapshot = {
  accountId, ownerId: actorId, accountEnabled: true, status: "active", planId: "creator", catalogVersion: "fixture-v1",
  isCurrent: true, verifiedAt: "2026-10-06T07:00:00Z", accessStartsAt: "2026-10-01T00:00:00Z",
  accessExpiresAt: "2026-11-01T00:00:00Z", cancelAtPeriodEnd: false, pauseCollection: false,
};
export const plan = {
  id: "creator", version: "fixture-v1", approved: true, workspaceLimit: 1,
  limits: { projects: 10, images: 10, video_seconds: 10, narration_characters: 10,
    transcription_seconds: 10, llm_tokens: 10, render_seconds: 10, storage_bytes: 10 },
  features: ["generation"],
};
export const resource = { kind: "project", id: resourceId };
export const usage = { operationKey: "operation-fixture-1", purpose: "image", items: { images: 1 }, input: { prompt: "fixture" } };

export function billingFixture(overrides = {}) {
  const calls = [];
  const repository = {
    async getAccountForActor(id) { calls.push(["account", id]); return account; },
    async getCurrentSubscription(value) { calls.push(["subscription", value.id]); return snapshot; },
    async getResourceOwner(value) { calls.push(["owner", value]); return actorId; },
    async reserve(value) { calls.push(["reserve", value]); return { id: operationId, state: "reserved", created: true }; },
    async settle(value) { calls.push(["settle", value]); return { id: operationId, state: "unknown", changed: true }; },
    ...overrides.repository,
  };
  return { calls, dependencies: { enabled: true, approvedPlans: [plan], maxPending: 4, now: () => now,
    async verifyActor() { calls.push(["verify"]); return { id: actorId, email: "fixture@example.test" }; },
    ...overrides, repository } };
}
