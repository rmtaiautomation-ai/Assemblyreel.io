import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("query");
    const provider = req.nextUrl.searchParams.get("provider") || "pexels"; // "pexels" | "pixabay"
    const type = req.nextUrl.searchParams.get("type") || "video"; // "video" | "image"

    if (!query) {
      return NextResponse.json({ success: false, error: "query is required" }, { status: 400 });
    }

    let results = [];

    if (provider === "pexels") {
      const apiKey = process.env.PEXELS_API_KEY;
      if (!apiKey) throw new Error("PEXELS_API_KEY is not set");

      const url = type === "video" 
        ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8`
        : `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=8`;

      const res = await fetch(url, { headers: { Authorization: apiKey } });
      if (!res.ok) throw new Error(`Pexels API error (${res.status})`);
      const data = await res.json();

      if (type === "video") {
        results = (data.videos || []).map((v: any) => {
          const hdVideo = v.video_files?.find((f: any) => f.quality === "hd") || v.video_files?.[0];
          return {
            id: `px_v_${v.id}`,
            thumbnailUrl: v.image,
            mediaUrl: hdVideo?.link,
            type: "video"
          };
        }).filter((r: any) => r.mediaUrl);
      } else {
        results = (data.photos || []).map((p: any) => {
          return {
            id: `px_i_${p.id}`,
            thumbnailUrl: p.src.medium,
            mediaUrl: p.src.large2x || p.src.original,
            type: "image"
          };
        });
      }
    } 
    else if (provider === "pixabay") {
      const apiKey = process.env.PIXABAY_API_KEY;
      if (!apiKey) throw new Error("PIXABAY_API_KEY is not set");

      const url = type === "video"
        ? `https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(query)}&per_page=8`
        : `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=8`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Pixabay API error (${res.status})`);
      const data = await res.json();

      if (type === "video") {
        results = (data.hits || []).map((v: any) => {
          // Pixabay videos object has multiple sizes, e.g. v.videos.large.url
          const videoUrl = v.videos?.large?.url || v.videos?.medium?.url || v.videos?.small?.url;
          // Pixabay videos thumbnail requires extracting picture_id
          const thumbnailUrl = v.picture_id 
             ? `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg` 
             : "";
          return {
            id: `pb_v_${v.id}`,
            thumbnailUrl: thumbnailUrl,
            mediaUrl: videoUrl,
            type: "video"
          };
        }).filter((r: any) => r.mediaUrl);
      } else {
        results = (data.hits || []).map((p: any) => {
          return {
            id: `pb_i_${p.id}`,
            thumbnailUrl: p.webformatURL,
            mediaUrl: p.largeImageURL,
            type: "image"
          };
        });
      }
    } else {
      throw new Error("Invalid provider");
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("[/api/stock-media] Error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to search stock media." },
      { status: 500 }
    );
  }
}
