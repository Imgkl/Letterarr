import { getSettings, saveSettings } from "./storage.js";

document.addEventListener("DOMContentLoaded", () => {
  wireForm();
  refresh();
  document.getElementById("save").addEventListener("click", handleSave);
  document.getElementById("test-connection").addEventListener("click", handleTest);
});

async function refresh() {
  const settings = await getSettings();
  setForm(settings);
}

function setForm(settings) {
  document.getElementById("jelly-lan").value = settings.jellyseerr.lanBaseUrl || "";
  document.getElementById("jelly-key").value = settings.jellyseerr.apiKey || "";
}

function wireForm() {
  // placeholder for future validation hooks
}

async function handleSave() {
  const settings = {
    jellyseerr: {
      lanBaseUrl: document.getElementById("jelly-lan").value.trim(),
      apiKey: document.getElementById("jelly-key").value.trim()
    }
  };

  await saveSettings(settings);
  chrome.runtime.sendMessage({ type: "saveSettings", settings });
}

async function handleTest() {
  const status = document.getElementById("test-status");
  status.style.color = "";
  status.textContent = "Testing…";
  const settings = {
    jellyseerr: {
      lanBaseUrl: document.getElementById("jelly-lan").value.trim(),
      apiKey: document.getElementById("jelly-key").value.trim()
    }
  };
  chrome.runtime.sendMessage({ type: "testConnection", settings }, (resp) => {
    if (!resp?.ok) {
      status.textContent = resp?.error || "Failed";
      status.style.color = "#ff6b6b";
      return;
    }
    status.textContent = "Connection OK (saved)";
    status.style.color = "#34c759";
    // persist on success
    saveSettings(settings);
    chrome.runtime.sendMessage({ type: "saveSettings", settings });
  });
}

