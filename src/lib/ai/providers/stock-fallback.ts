// Cinematic fallback videos for development & zero-config testing.
// Google's old gtv-videos-bucket sample set returns 403 on every file
// (verified 2026-08-08) — browsers surface that as "NotSupportedError: no
// supported sources" since the response body isn't playable media. These
// were checked individually for a 200 video/mp4 response.
const CINEMATIC_SAMPLE_VIDEOS = [
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/sintel/mp4/h264/720/Sintel_720_10s_1MB.mp4",
  "https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_1MB.mp4",
  "https://download.samplelib.com/mp4/sample-10s.mp4",
];

// Deterministic pick so the same scene always gets the same placeholder within a session.
export function getStockFallbackVideoUrl(seed: string): string {
  const hash = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CINEMATIC_SAMPLE_VIDEOS[hash % CINEMATIC_SAMPLE_VIDEOS.length];
}
