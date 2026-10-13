import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const RECOVERY_COOKIE = "ar_recovery";
function secret() {
  const value = process.env.AUTH_RECOVERY_SECRET;
  if (!value || value.length < 32) throw new Error("Recovery configuration is unavailable.");
  return value;
}
function mac(value: string) { return createHmac("sha256", secret()).update(value).digest(); }
export function issueRecoveryProof(userId: string, sessionId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ userId, sessionId, expires: now + 600_000 })).toString("base64url");
  return payload + "." + mac(payload).toString("base64url");
}
export function validRecoveryProof(value: string | undefined, userId: string, sessionId: string, now = Date.now()) {
  try {
    if (!value || value.length > 1024) return false;
    const parts = value.split(".");
    if (parts.length !== 2) return false;
    const signature = Buffer.from(parts[1], "base64url"), expected = mac(parts[0]);
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return false;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return payload.userId === userId && payload.sessionId === sessionId && Number.isFinite(payload.expires) &&
      payload.expires > now && payload.expires <= now + 600_000;
  } catch { return false; }
}
