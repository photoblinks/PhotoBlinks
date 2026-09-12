const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Extracts a YouTube video id from watch/share/embed/shorts URL formats,
 * or null if the URL isn't a recognizable single-video YouTube link (e.g.
 * a channel/playlist/unrelated URL, or a malformed id). This is the only
 * place that parses `youtube_url` — every other output (iframe, embed URL,
 * thumbnail, structured data) is derived from this same id. */
function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    let videoId: string | null = null;

    if (parsed.hostname === "youtu.be" || parsed.hostname.endsWith(".youtu.be")) {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v");
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] ?? null;
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2] ?? null;
      }
    }

    return videoId && YOUTUBE_VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

/** Extracts a YouTube video id from watch/share/embed URL formats and
 * returns a privacy-enhanced embed URL, or null if the URL isn't a
 * recognizable YouTube link. */
export function getYouTubeEmbedUrl(url: string): string | null {
  const videoId = extractYouTubeVideoId(url);
  return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : null;
}

export type ValidatedYouTubeVideo = {
  videoId: string;
  embedUrl: string;
  /** Standard YouTube-hosted thumbnail; always exists for a real video id. */
  thumbnailUrl: string;
  watchUrl: string;
};

/** Single source of truth for "is this stored URL a real, embeddable
 * YouTube video". Returns the same parsed video identity that should drive
 * every output derived from it (iframe, VideoObject embedUrl/thumbnailUrl).
 * Returns null for empty/missing/malformed/non-video (e.g. channel) URLs —
 * callers must treat that as "no video" and render nothing. */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}

export function getValidatedYouTubeVideo(url: string | null | undefined): ValidatedYouTubeVideo | null {
  if (!url) return null;
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  return {
    videoId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}
