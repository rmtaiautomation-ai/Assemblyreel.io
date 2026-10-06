interface RenderScene {
  id: string;
  mediaUrl?: string;
  [key: string]: unknown;
}

interface RenderAudioClip {
  id: string;
  src?: string;
  [key: string]: unknown;
}

export interface RenderPayload {
  projectId: string;
  scenes: RenderScene[];
  audioUrl?: string;
  audioClips?: RenderAudioClip[];
  [key: string]: unknown;
}

export type PreparedRenderPayload = RenderPayload & {
  scenes: RenderScene[];
  audioClips: RenderAudioClip[];
};

export type PrepareRenderPayloadResult =
  | { success: true; payload: PreparedRenderPayload }
  | { success: false; error: string };

export function isRenderPayload(value: unknown): value is RenderPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RenderPayload>;
  return Boolean(candidate.projectId && Array.isArray(candidate.scenes) && candidate.scenes.length > 0);
}

/** Makes browser-facing asset URLs usable by the headless renderer. */
export function prepareRenderPayload(
  payload: RenderPayload,
  origin: string
): PrepareRenderPayloadResult {
  const absolutize = (url: string | undefined) =>
    url?.startsWith("/") ? `${origin}${url}` : url;

  const browserOnlyAssets: string[] = [];
  const recordBlobUrl = (url: string | undefined, label: string) => {
    if (url?.startsWith("blob:")) browserOnlyAssets.push(label);
  };

  const scenes = payload.scenes.map((scene) => {
    let mediaUrl = scene.mediaUrl;
    recordBlobUrl(mediaUrl, `scene ${scene.id}`);

    if (mediaUrl?.startsWith("/")) {
      mediaUrl = `${origin}${mediaUrl}`;
    } else if (mediaUrl?.includes("commondatastorage.googleapis.com/gtv-videos-bucket")) {
      mediaUrl = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";
    }

    return { ...scene, mediaUrl };
  });

  const audioClips = (payload.audioClips ?? []).map((clip) => {
    recordBlobUrl(clip.src, `audio clip ${clip.id}`);
    return { ...clip, src: absolutize(clip.src) };
  });

  if (browserOnlyAssets.length > 0) {
    return {
      success: false,
      error:
        `Cannot render: ${browserOnlyAssets.join(", ")} still reference browser-only blob: URLs. ` +
        "Wait for these uploads to finish, then render again.",
    };
  }

  return {
    success: true,
    payload: {
      ...payload,
      scenes,
      audioUrl: absolutize(payload.audioUrl),
      audioClips,
    },
  };
}
