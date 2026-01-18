const defaultSettings = {
  jellyseerr: {
    apiKey: "",
    lanBaseUrl: ""
  }
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...defaultSettings, ...(settings || {}) };
}

export async function saveSettings(next) {
  await chrome.storage.local.set({ settings: next });
}

export function pickBaseUrl(service, networkMode = "lan") {
  if (!service) return "";
  if (service.lanBaseUrl) return service.lanBaseUrl;
  return "";
}

export function normalizeUrl(url) {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

