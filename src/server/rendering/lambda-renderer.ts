import { pollLambdaRenderProgress, startLambdaRender } from "./lambda-render";
import { syncPayloadMediaToS3 } from "./s3-sync";
import type { PreparedRenderPayload } from "./render-payload";
import { getRenderProgress, setRenderProgress } from "./render-progress-store";

const S3_SYNC_TIMEOUT_MS = 5 * 60 * 1000;
const LAMBDA_SUBMISSION_TIMEOUT_MS = 60 * 1000;

export interface LambdaRenderResult {
  success: true;
  mode: "lambda";
  projectId: string;
  renderId: string;
  message: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(milliseconds / 1000)}s`)),
      milliseconds
    );

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export async function refreshLambdaProgress(projectId: string): Promise<void> {
  const entry = getRenderProgress(projectId);
  if (
    !entry ||
    entry.mode !== "lambda" ||
    entry.stage === "done" ||
    entry.stage === "error" ||
    !entry.renderId ||
    !entry.bucketName
  ) {
    return;
  }

  try {
    const result = await pollLambdaRenderProgress({
      renderId: entry.renderId,
      bucketName: entry.bucketName,
    });
    setRenderProgress(projectId, {
      ...entry,
      progress: result.progress,
      stage: result.error ? "error" : result.stage,
      outputUrl: result.outputUrl,
      error: result.error,
    });
  } catch (error) {
    console.warn(
      `[Lambda Render] Progress poll failed for ${projectId}:`,
      errorMessage(error, "Unknown polling error")
    );
  }
}

export async function renderViaLambda(
  projectId: string,
  payload: PreparedRenderPayload,
  origin: string
): Promise<LambdaRenderResult> {
  console.log(`[Remotion Render] Starting Lambda render for project ${projectId}...`);
  setRenderProgress(projectId, {
    progress: 0,
    stage: "syncing media to s3",
    mode: "lambda",
    startedAt: Date.now(),
  });

  let s3Payload: PreparedRenderPayload;
  try {
    s3Payload = await withTimeout(
      syncPayloadMediaToS3(payload, origin),
      S3_SYNC_TIMEOUT_MS,
      "S3 media sync"
    );
  } catch (error) {
    const message = errorMessage(error, "Failed to sync media to S3.");
    setRenderProgress(projectId, {
      progress: 0,
      stage: "error",
      mode: "lambda",
      error: message,
      startedAt: Date.now(),
    });
    throw new Error(message);
  }

  setRenderProgress(projectId, {
    progress: 0,
    stage: "submitting to lambda",
    mode: "lambda",
    startedAt: Date.now(),
  });

  let handle: Awaited<ReturnType<typeof startLambdaRender>>;
  try {
    handle = await withTimeout(
      startLambdaRender(s3Payload),
      LAMBDA_SUBMISSION_TIMEOUT_MS,
      "Lambda render submission"
    );
  } catch (error) {
    const message = errorMessage(error, "Failed to submit render to Lambda.");
    setRenderProgress(projectId, {
      progress: 0,
      stage: "error",
      mode: "lambda",
      error: message,
      startedAt: Date.now(),
    });
    throw new Error(message);
  }

  setRenderProgress(projectId, {
    progress: 0,
    stage: "rendering",
    mode: "lambda",
    renderId: handle.renderId,
    bucketName: handle.bucketName,
    startedAt: Date.now(),
  });

  console.log(`[Remotion Render] Lambda render ${handle.renderId} submitted for project ${projectId}.`);
  return {
    success: true,
    mode: "lambda",
    projectId,
    renderId: handle.renderId,
    message: "Render submitted to AWS Lambda. Poll for progress to get the output URL.",
  };
}
