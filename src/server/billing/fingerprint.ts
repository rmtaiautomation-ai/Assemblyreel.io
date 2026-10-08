import "server-only";
import { createHash } from "node:crypto";
import { BillingError } from "./errors";

export type BillingJson = null | boolean | number | string | readonly BillingJson[]
  | { readonly [key: string]: BillingJson };

function canonicalJson(value: BillingJson, depth = 0): string {
  if (depth > 16) throw new BillingError("INVALID_REQUEST");
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item, depth + 1)).join(",")}]`;
  if (typeof value === "object" && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(
      (value as Readonly<Record<string, BillingJson>>)[key], depth + 1,
    )}`).join(",")}}`;
  }
  throw new BillingError("INVALID_REQUEST");
}

export function fingerprintBillingInput(value: BillingJson): string {
  const canonical = canonicalJson(value);
  if (Buffer.byteLength(canonical, "utf8") > 256_000) throw new BillingError("INVALID_REQUEST");
  return createHash("sha256").update(canonical).digest("hex");
}
