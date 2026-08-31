import { renderMediaOnLambda, getRenderProgress } from "@remotion/lambda/client";
import type { AwsRegion } from "@remotion/lambda/client";
import { getLambdaConfig } from "./lambda-config";

/**
 * Phase 3 of implementation_plans/10-aws-lambda-cloud-rendering.md — thin
 * wrapper around @remotion/lambda so the render route doesn't deal with the
 * SDK's input shape directly. Composition id matches the one already used by
 * the local render path (`getCompositions(...).find(c => c.id === "MainVideo")`
 * in render-remotion/route.ts) — the Lambda site bundle exposes the same
 * Remotion project, so the composition id is identical.
 */
const COMPOSITION_ID = "MainVideo";

export interface LambdaRenderHandle {
  renderId: string;
  bucketName: string;
}

// Brand-new AWS accounts default to a very low Lambda "concurrent executions"
// account quota (often just 10, as an anti-abuse measure) — well under what
// renderMediaOnLambda tries to use by default for parallelizing chunks, which
// throttles with "AWS Concurrency limit reached (Rate Exceeded)" on the very
// first render. Capping `concurrency` keeps chunk parallelism under that
// default quota so renders succeed out of the box; once a Service Quota
// increase is requested and approved (console: Service Quotas → AWS Lambda →
// "Concurrent executions"), bump REMOTION_LAMBDA_CONCURRENCY instead of
// touching this file — renders will speed up accordingly.
const DEFAULT_CONCURRENCY = 6;
function getConcurrency(): number {
  const raw = process.env.REMOTION_LAMBDA_CONCURRENCY;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

export async function startLambdaRender(inputProps: Record<string, unknown>): Promise<LambdaRenderHandle> {
  const { region, functionName, serveUrl } = getLambdaConfig();

  const { renderId, bucketName } = await renderMediaOnLambda({
    region: region as AwsRegion,
    functionName,
    serveUrl,
    composition: COMPOSITION_ID,
    inputProps,
    codec: "h264",
    concurrency: getConcurrency(),
  });

  return { renderId, bucketName };
}

export interface LambdaProgressResult {
  progress: number;
  stage: string;
  done: boolean;
  outputUrl: string | null;
  error: string | null;
}

export async function pollLambdaRenderProgress(handle: LambdaRenderHandle): Promise<LambdaProgressResult> {
  const { region, functionName } = getLambdaConfig();

  const progress = await getRenderProgress({
    renderId: handle.renderId,
    bucketName: handle.bucketName,
    functionName,
    region: region as AwsRegion,
  });

  if (progress.fatalErrorEncountered) {
    const message = progress.errors[0]?.message || "Lambda render failed with a fatal error.";
    return { progress: progress.overallProgress, stage: "error", done: true, outputUrl: null, error: message };
  }

  return {
    progress: progress.overallProgress,
    stage: progress.done ? "done" : "rendering",
    done: progress.done,
    outputUrl: progress.outputFile,
    error: null,
  };
}
