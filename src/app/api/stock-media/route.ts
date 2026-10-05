import { NextRequest, NextResponse } from "next/server";
import { searchStockMedia } from "@/lib/media/stock-search";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query");
    const provider = req.nextUrl.searchParams.get("provider") || "pexels"; // "pexels" | "pixabay"
    const type = req.nextUrl.searchParams.get("type") || "video"; // "video" | "image"

    if (!query) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    const results = await searchStockMedia(query, provider, type as "video" | "image");

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[/api/stock-media] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to search stock media." },
      { status: 500 }
    );
  }
}
