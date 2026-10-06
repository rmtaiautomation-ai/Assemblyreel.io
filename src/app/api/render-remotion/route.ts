import { NextRequest, NextResponse } from "next/server";
import { isLambdaConfigured } from "@/server/rendering/lambda-config";
import { refreshLambdaProgress, renderViaLambda } from "@/server/rendering/lambda-renderer";
import { renderLocally } from "@/server/rendering/local-renderer";
import { isRenderPayload, prepareRenderPayload } from "@/server/rendering/render-payload";
import {
  getRenderProgress,
  isRenderInFlight,
  setRenderProgress,
} from "@/server/rendering/render-progress-store";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Failed to process video render request.";
}

// Polled by the editor while a render is in flight.
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });
  }

  await refreshLambdaProgress(projectId);
  const entry = getRenderProgress(projectId);

  return NextResponse.json({
    success: true,
    progress: entry?.progress ?? 0,
    stage: entry?.stage ?? null,
    mode: entry?.mode ?? "local",
    outputUrl: entry?.outputUrl ?? null,
    error: entry?.error ?? null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const requestBody: unknown = await request.json();
    if (!isRenderPayload(requestBody)) {
      return NextResponse.json(
        { success: false, error: "Invalid render payload: missing projectId or scenes." },
        { status: 400 }
      );
    }

    const projectId = requestBody.projectId;
    if (isRenderInFlight(projectId)) {
      return NextResponse.json(
        { success: false, error: "A render for this project is already in progress." },
        { status: 409 }
      );
    }

    setRenderProgress(projectId, {
      progress: 0,
      stage: "starting",
      mode: "local",
      startedAt: Date.now(),
    });

    const prepared = prepareRenderPayload(requestBody, request.nextUrl.origin);
    if (!prepared.success) {
      setRenderProgress(projectId, {
        progress: 0,
        stage: "error",
        mode: "local",
        error: "blob URLs unresolved",
        startedAt: Date.now(),
      });
      return NextResponse.json({ success: false, error: prepared.error }, { status: 400 });
    }

    const result = isLambdaConfigured()
      ? await renderViaLambda(projectId, prepared.payload, request.nextUrl.origin)
      : await renderLocally(projectId, prepared.payload);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Remotion Render API Error:", error);
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: 500 });
  }
}
