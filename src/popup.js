import { getSettings, saveSettings } from "./storage.js";

const els = {};

document.addEventListener("DOMContentLoaded", async () => {
  cache();
  const settings = await getSettings();
  els.url.value = settings.jellyseerr.lanBaseUrl || "";
  els.key.value = settings.jellyseerr.apiKey || "";

  els.save.addEventListener("click", () => verify({ save: true }));
  els.url.addEventListener("input", clearFieldErrors);
  els.key.addEventListener("input", clearFieldErrors);

  // Auto-check the live connection on open when credentials already exist,
  // so the popup reflects reality instead of always starting "not verified".
  if (els.url.value && els.key.value) {
    verify({ save: false });
  } else {
    setState("idle");
  }
});

function cache() {
  els.dots = document.getElementById("dots");
  els.pill = document.getElementById("pill");
  els.pillLabel = document.getElementById("pill-label");
  els.url = document.getElementById("jelly-url");
  els.key = document.getElementById("jelly-key");
  els.urlInput = document.getElementById("url-input");
  els.keyInput = document.getElementById("key-input");
  els.save = document.getElementById("save");
  els.ctaLabel = document.getElementById("cta-label");
  els.ctaSpinner = document.getElementById("cta-spinner");
  els.foot = document.getElementById("foot");
}

// state: "idle" | "verifying" | "connected" | "error"
function setState(state, detail) {
  const dim = (on) => els.dots.classList.toggle("dim", on);
  const pill = (cls, label) => { els.pill.className = `pill ${cls}`; els.pillLabel.textContent = label; };
  const foot = (cls, text) => { els.foot.className = `foot ${cls}`; els.foot.textContent = text; };
  const cta = (cls, label, { spinner = false, disabled = false } = {}) => {
    els.save.className = `cta ${cls}`;
    els.ctaLabel.textContent = label;
    els.ctaSpinner.hidden = !spinner;
    els.save.disabled = disabled;
  };

  switch (state) {
    case "idle":
      dim(true); pill("idle", "Not connected"); cta("green", "Save & verify");
      foot("muted", "Enter your server details to begin");
      break;
    case "verifying":
      dim(false); pill("work", "Verifying…");
      cta("work", "Verifying…", { spinner: true, disabled: true });
      foot("muted", "Contacting server…");
      break;
    case "connected":
      dim(false); pill("ok", "Connected"); cta("green", "Save & verify");
      foot("ok", "✓ Reachable · checked just now");
      break;
    case "error":
      dim(true); pill("err", "Unreachable"); cta("green", "Retry");
      els.urlInput.classList.add("bad");
      foot("err", detail || "✕ Couldn't reach server — check URL & key");
      break;
  }
}

function clearFieldErrors() {
  els.urlInput.classList.remove("bad");
  els.keyInput.classList.remove("bad");
}

function readForm() {
  return {
    jellyseerr: {
      lanBaseUrl: els.url.value.trim(),
      apiKey: els.key.value.trim()
    }
  };
}

// Verifies the connection. `save: true` persists on success (manual click);
// `save: false` is the silent auto-check when the popup opens.
function verify({ save }) {
  clearFieldErrors();
  const settings = readForm();

  if (!settings.jellyseerr.lanBaseUrl || !settings.jellyseerr.apiKey) {
    if (save) {
      if (!settings.jellyseerr.lanBaseUrl) els.urlInput.classList.add("bad");
      if (!settings.jellyseerr.apiKey) els.keyInput.classList.add("bad");
      setState("error", "✕ Enter both a URL and an API key");
    } else {
      setState("idle");
    }
    return;
  }

  setState("verifying");
  chrome.runtime.sendMessage({ type: "testConnection", settings }, async (resp) => {
    if (chrome.runtime.lastError || !resp?.ok) {
      const err = chrome.runtime.lastError?.message || resp?.error;
      setState("error", err ? `✕ ${err}` : undefined);
      return;
    }
    if (save) {
      await saveSettings(settings);
      chrome.runtime.sendMessage({ type: "saveSettings", settings });
    }
    setState("connected");
  });
}
