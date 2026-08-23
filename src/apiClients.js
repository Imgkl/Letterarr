import { normalizeUrl, pickBaseUrl } from "./storage.js";

// A hung request is worse than a failed one: without a deadline the caller's
// callback never fires and the button sits in "Adding…" forever.
const REQUEST_TIMEOUT_MS = 15000;

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Request failed ${res.status}: ${text}`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function makeJellyseerrClient(settings, networkMode = "lan") {
  const base = normalizeUrl(pickBaseUrl(settings.jellyseerr, networkMode));
  const key = settings.jellyseerr.apiKey;
  if (!base || !key) return null;

  const authHeaders = { "X-Api-Key": key };

  return {
    async request(media) {
      // media: {tmdbId, mediaType: "movie" | "tv"}
      return fetchJson(`${base}/api/v1/request`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          mediaId: media.tmdbId,
          mediaType: media.mediaType || "movie"
        })
      });
    },
    async search(query) {
      return fetchJson(`${base}/api/v1/search?query=${encodeURIComponent(query)}`, {
        headers: authHeaders
      });
    },
    async getMedia(tmdbId, mediaType) {
      // Returns the film/show detail object; caller reads `.mediaInfo?.status`.
      const kind = mediaType === "tv" ? "tv" : "movie";
      return fetchJson(`${base}/api/v1/${kind}/${tmdbId}`, { headers: authHeaders });
    },
    async ping() {
      return fetchJson(`${base}/api/v1/status`, { headers: authHeaders });
    }
  };
}

