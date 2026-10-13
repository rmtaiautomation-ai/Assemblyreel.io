import { createClient } from "@supabase/supabase-js";
import { authLaunchReady, siteOrigin } from "@/server/auth/policy";
import { leadSchema } from "@/server/auth/leads";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  if (!authLaunchReady() || process.env.MARKETING_LEADS_ENABLED !== "true" || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Early-access requests are not open yet." }, { status: 503, headers });
  }
  try {
    if (request.headers.get("origin") !== siteOrigin()) {
      return Response.json({ error: "Invalid request origin." }, { status: 403, headers });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return Response.json({ error: "JSON is required." }, { status: 415, headers });
    }
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ error: "Request body is required." }, { status: 400, headers });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return Response.json({ error: "Request is too large." }, { status: 413, headers });
      }
      chunks.push(value);
    }
    const payload = leadSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!payload.success) return Response.json({ error: "Please check your request details." }, { status: 400, headers });
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.rpc("record_marketing_lead", { payload: payload.data });
    if (error) {
      const rateLimited = error.message.includes("LEAD_RATE_LIMIT");
      return Response.json({ error: rateLimited ? "Please wait before submitting another request." : "Unable to save your request. Please try again later." }, { status: rateLimited ? 429 : 503, headers });
    }
    return Response.json({ success: true }, { status: 201, headers });
  } catch {
    return Response.json({ error: "Unable to save your request. Please check your details and try again." }, { status: 400, headers });
  }
}
