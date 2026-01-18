import { normalizeUrl, pickBaseUrl } from "./storage.js";

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status}: ${text}`);
  }
  return res.json();
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
    async ping() {
      return fetchJson(`${base}/api/v1/status`, { headers: authHeaders });
    }
  };
}

