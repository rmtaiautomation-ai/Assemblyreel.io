import { apiResponse, readJson, requireOrigin } from "@/server/access/requests";
import { requireOwnedEditor, readOwnedEditor, saveOwnedEditor } from "@/server/access/owned-editor";
import { editorSaveSchema } from "@/features/owned-editor/schema";

type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, { params }: Context) {
  return apiResponse(async () => {
    requireOwnedEditor();
    return Response.json(await readOwnedEditor((await params).projectId));
  });
}
export async function PUT(request: Request, { params }: Context) {
  return apiResponse(async () => {
    requireOwnedEditor();
    requireOrigin(request);
    const input = await readJson(request, editorSaveSchema, 262144);
    return Response.json(await saveOwnedEditor((await params).projectId, input));
  });
}
