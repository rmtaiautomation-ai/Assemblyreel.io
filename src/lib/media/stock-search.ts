export interface StockMediaResult {
  id: string;
  thumbnailUrl: string;
  mediaUrl: string;
  type: string;
}

export async function searchStockMedia(query: string, provider: string, type: "video" | "image"): Promise<StockMediaResult[]> {
  if (!query) {
    throw new Error("query is required");
  }

  let results: StockMediaResult[] = [];

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
        const videoUrl = v.videos?.large?.url || v.videos?.medium?.url || v.videos?.small?.url;
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
  } else if (provider === "wikimedia") {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}${type === 'video' ? ' filetype:video' : ''}&gsrnamespace=6&prop=imageinfo&iiprop=url&format=json&gsrlimit=8&origin=*`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikimedia API error (${res.status})`);
    const data = await res.json();
    
    const pages = data.query?.pages || {};
    results = Object.values(pages).map((p: any) => {
      const info = p.imageinfo?.[0] || {};
      return {
        id: `wm_${p.pageid}`,
        thumbnailUrl: info.url,
        mediaUrl: info.url,
        type: type
      };
    }).filter((r: any) => r.mediaUrl);
  } else if (provider === "all") {
    const promises: Promise<StockMediaResult[]>[] = [];
    if (process.env.PEXELS_API_KEY) {
      promises.push(searchStockMedia(query, "pexels", type).catch(() => []));
    }
    if (process.env.PIXABAY_API_KEY) {
      promises.push(searchStockMedia(query, "pixabay", type).catch(() => []));
    }
    promises.push(searchStockMedia(query, "wikimedia", type).catch(() => []));

    const settled = await Promise.all(promises);
    const combined: StockMediaResult[] = [];
    const maxLen = Math.max(...settled.map((s) => s.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const list of settled) {
        if (list[i]) combined.push(list[i]);
      }
    }
    return combined.slice(0, 12);
  } else {
    throw new Error("Invalid provider");
  }

  return results;
}
