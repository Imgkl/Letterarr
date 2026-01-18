import {
  getSettings,
  saveSettings,
} from "./storage.js";
import { makeJellyseerrClient } from "./apiClients.js";

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = {
    addItem: async () => {
      try {
        const result = await performAdd(message.item);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    },
    testConnection: async () => {
      const testSettings = message.settings;
      const jelly = makeJellyseerrClient({ jellyseerr: testSettings.jellyseerr }, "lan");
      if (!jelly) throw new Error("Missing base URL or API key");
      await jelly.ping();
      sendResponse({ ok: true });
    },
    saveSettings: async () => {
      await saveSettings(message.settings);
      sendResponse({ ok: true });
    }
  }[message?.type];

  if (handler) {
    handler().catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  return false;
});

async function performAdd(item) {
  const settings = await getSettings();
  const jelly = makeJellyseerrClient(settings, "lan");
  const mediaType = item.mediaType || "movie";

  if (!jelly) throw new Error("Jellyseerr not configured");

  let tmdbId = item.tmdbId;

  if (!tmdbId) {
    const term = item.year ? `${item.title} ${item.year}` : item.title;
    const search = await jelly.search(term);
    const match = (search?.results || []).find((r) => (mediaType === "tv" ? r.mediaType === "tv" : r.mediaType !== "tv"));
    tmdbId = match?.tmdbId;
    if (!tmdbId) throw new Error("Missing tmdbId and search found no match");
  }

  await jelly.request({ tmdbId, mediaType });
  return { via: "jellyseerr" };
}

