import { legacyFeatureResponse, legacyServiceEnabled } from "@/server/auth/capabilities";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { PresentationAccessError, requirePresentationProject } from '@/features/presentations/server/access';
import { prepareProjectPresentations } from '@/features/presentations/server/export';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Failed to process video render request.";
}

// Polled by the editor while a render is in flight.
export async function GET(request: NextRequest) {
  if (!legacyServiceEnabled()) return legacyFeatureResponse();
  /* Legacy implementation is retained for subsequent security phases. */
  const [{ refreshLambdaProgress }, { getRenderProgress }] = await Promise.all([
    import("@/server/rendering/lambda-renderer"),
    import("@/server/rendering/render-progress-store"),
  ]);
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });
  }

  try { await requirePresentationProject(await createClient(), projectId); }
  catch { return NextResponse.json({ success: false, error: 'Project access required.' }, { status: 403 }); }
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
  if (!legacyServiceEnabled()) return legacyFeatureResponse();
  /* Legacy implementation is retained for subsequent security phases. */
  try {
    // Load native rendering dependencies only after the access gate allows work.
    const [{ isLambdaConfigured }, { renderViaLambda }, { renderLocally },
      { isRenderPayload, prepareRenderPayload }, { isRenderInFlight, setRenderProgress }] = await Promise.all([
      import("@/server/rendering/lambda-config"),
      import("@/server/rendering/lambda-renderer"),
      import("@/server/rendering/local-renderer"),
      import("@/server/rendering/render-payload"),
      import("@/server/rendering/render-progress-store"),
    ]);
    const requestBody: unknown = await request.json();
    if (!isRenderPayload(requestBody)) {
      return NextResponse.json(
        { success: false, error: "Invalid render payload: missing projectId or scenes." },
        { status: 400 }
      );
    }

    const projectId = requestBody.projectId;
    const authorizedPayload = await prepareProjectPresentations(await createClient(), requestBody);
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

    const prepared = prepareRenderPayload(authorizedPayload, request.nextUrl.origin);
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
    return NextResponse.json({ success: false, error: errorMessage(error) }, { status: error instanceof PresentationAccessError ? error.status : 500 });
  }
}
