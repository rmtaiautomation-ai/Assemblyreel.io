/**
 * Central place to read AWS/Remotion Lambda configuration from env vars.
 *
 * Deliberately named `REMOTION_AWS_*` rather than the plain `AWS_*` names:
 * those are reserved/auto-populated by some hosts (Vercel, Lambda itself) and
 * colliding with them is a well-known Remotion Lambda footgun. Keeping our own
 * prefixed names means this config never accidentally picks up unrelated
 * credentials from the hosting environment.
 *
 * Nothing in this file throws at import time. Every route that touches Lambda
 * must call `isLambdaConfigured()` first and fall back to local rendering when
 * it's false — this app has no AWS keys set up yet (see
 * implementation_plans/10-aws-lambda-cloud-rendering.md), so local rendering
 * stays the default until the user finishes the AWS-side setup.
 *
 * ── `REMOTION_SERVE_URL` IS A FROZEN BUNDLE ──────────────────────────────
 * The two render paths do NOT stay in sync on their own:
 *
 *   - Local rendering calls `bundle()` per request, so it always runs the
 *     code currently on disk.
 *   - Lambda passes `serveUrl` straight through to `renderMediaOnLambda`. That
 *     URL points at a site bundle uploaded by `remotion lambda sites create`.
 *     It is NEVER rebuilt by this app.
 *
 * And the render route prefers Lambda whenever this config is complete. So
 * after ANY change under `src/remotion/**` you must run:
 *
 *     npm run deploy:remotion
 *
 * Skip it and the Player shows your new work while the export silently
 * renders the previously-deployed code — no error, no warning. Anything that
 * degrades gracefully on unknown input (the card style registry, for one) will
 * quietly fall back instead of failing loudly, which is exactly what makes a
 * stale bundle so hard to spot. That is why unknown card styles render a
 * visible marker rather than a silent substitute.
 */

export interface LambdaConfig {
  region: string;
  functionName: string;
  serveUrl: string;
  bucketName: string;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function isLambdaConfigured(): boolean {
  return Boolean(
    readEnv("REMOTION_AWS_ACCESS_KEY_ID") &&
      readEnv("REMOTION_AWS_SECRET_ACCESS_KEY") &&
      readEnv("REMOTION_AWS_REGION") &&
      readEnv("REMOTION_FUNCTION_NAME") &&
      readEnv("REMOTION_SERVE_URL") &&
      readEnv("REMOTION_S3_BUCKET_NAME")
  );
}

/**
 * Throws if called before `isLambdaConfigured()` has been checked — callers
 * must gate on that first so a missing-config state degrades to local
 * rendering instead of a 500.
 */
export function getLambdaConfig(): LambdaConfig {
  const region = readEnv("REMOTION_AWS_REGION");
  const functionName = readEnv("REMOTION_FUNCTION_NAME");
  const serveUrl = readEnv("REMOTION_SERVE_URL");
  const bucketName = readEnv("REMOTION_S3_BUCKET_NAME");

  if (!region || !functionName || !serveUrl || !bucketName) {
    throw new Error(
      "Lambda rendering is not configured. Set REMOTION_AWS_ACCESS_KEY_ID, " +
        "REMOTION_AWS_SECRET_ACCESS_KEY, REMOTION_AWS_REGION, REMOTION_FUNCTION_NAME, " +
        "REMOTION_SERVE_URL, and REMOTION_S3_BUCKET_NAME in .env.local " +
        "(see implementation_plans/10-aws-lambda-cloud-rendering.md, Phase 1)."
    );
  }

  return { region, functionName, serveUrl, bucketName };
}
