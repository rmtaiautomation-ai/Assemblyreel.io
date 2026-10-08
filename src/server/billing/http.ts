import "server-only";
import { BillingError } from "./errors";
import { billingSiteOrigin } from "./catalog";

export function billingJsonResponse(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function billingErrorResponse(error: unknown): Response {
  const code = error instanceof BillingError ? error.code : "BILLING_UNAVAILABLE";
  const status = code === "AUTH_REQUIRED" ? 401 : code === "OWNERSHIP_REQUIRED" ? 403
    : code === "INVALID_REQUEST" || code === "INVALID_RESERVATION" ? 400
    : code === "LIMIT_REACHED" || code === "CONCURRENCY_LIMIT" ? 429
    : code === "OPERATION_CONFLICT" ? 409 : 503;
  return billingJsonResponse({ error: code, code }, status);
}

export function requireBillingOrigin(request: Request, configuredOrigin: string): void {
  const origin = billingSiteOrigin(configuredOrigin);
  if (request.headers.get("origin") !== origin) throw new BillingError("OWNERSHIP_REQUIRED");
}

export async function readBillingBody(request: Request, maximumBytes: number): Promise<string> {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) throw new BillingError("INVALID_REQUEST");
  const reader = request.body?.getReader();
  if (!reader) throw new BillingError("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new BillingError("INVALID_REQUEST"); }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new BillingError("INVALID_REQUEST");
  } finally { reader.releaseLock(); }
}

export async function readCheckoutJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new BillingError("INVALID_REQUEST");
  }
  try { return JSON.parse(await readBillingBody(request, 8192)); }
  catch { throw new BillingError("INVALID_REQUEST"); }
}
