(function () {
  // Some browsers (Dia) serve film pages from a letterboxd.com subdomain such as
  // embed.letterboxd.com — same markup, different origin. Accept any of them.
  if (!/^https:\/\/([a-z0-9-]+\.)*letterboxd\.com$/.test(location.origin)) return;
  if (!/^\/film\/[^/]+\/?$/.test(location.pathname)) return;

  const BUTTON_LI_ID = "lbarr-jellyseerr-li";
  const BUTTON_ID = "lbarr-jellyseerr-btn";

  // A state is clickable iff it has an `action`. Green means one thing only:
  // the film is on disk.
  const STATES = {
    checking:    { label: "Checking…",                      bg: "#2c3440", fg: "#99aabb" },
    setup:       { label: "Set up Letterarr →",             bg: "#ff8000", fg: "#14181c", action: openOptions },
    add:         { label: "Add to Jellyseerr",              bg: "#40bcf4", fg: "#14181c", action: doAdd },
    requested:   { label: "Requested — view in Jellyseerr", bg: "#3a4149", fg: "#cbd5e0", action: openMedia },
    available:   { label: "Available in library",           bg: "#00e054", fg: "#14181c" },
    failed:      { label: "Failed — retry",                 bg: "#e0224a", fg: "#ffffff", action: doAdd },
    unreachable: { label: "⚠ Unreachable — retry",          bg: "#e0224a", fg: "#ffffff", action: requestStatus }
  };

  let btn = null;
  let currentMeta = null;
  let clickHandler = null;
  let resolvedTmdbId = null;
  let hasFetched = false;
  let lastStateKey = "checking";
  let lastLabel = null;
  let checkQueued = false;

  ensureButton();
  watchPanel();

  function ensureButton() {
    if (document.getElementById(BUTTON_LI_ID)) return;

    const panel = document.querySelector("section#userpanel.actions-panel ul.js-actions-panel");
    if (!panel) return;

    const shareLi = panel.querySelector("li.panel-sharing");
    if (!shareLi) return;

    injectButton(shareLi);

    // Re-injecting after a wipe restores what we already knew rather than
    // spending another request on it.
    if (hasFetched) applyState(lastStateKey, lastLabel);
    else requestStatus();
  }

  // Letterboxd fills this sidebar from a client-side include whose placeholder
  // sits inside the same <ul> we inject into, so a late hydration can take our
  // <li> with it. Watching means that's repaired instead of permanent, and it
  // drops the old fixed injection deadline for slow page loads.
  function watchPanel() {
    new MutationObserver(() => {
      if (checkQueued) return;
      checkQueued = true;
      requestAnimationFrame(() => {
        checkQueued = false;
        ensureButton();
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function injectButton(shareLi) {
    const li = document.createElement("li");
    li.id = BUTTON_LI_ID;
    li.className = "row-fill";

    const wrap = document.createElement("div");
    wrap.setAttribute("role", "none");
    wrap.className = "menuitem -trigger -has-no-icon";

    btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.setAttribute("role", "menuitem");
    Object.assign(btn.style, {
      display: "block",
      width: "100%",
      textAlign: "center",
      border: "none",
      borderRadius: "4px",
      padding: "6px 10px",
      fontWeight: "700"
    });

    wrap.appendChild(btn);
    li.appendChild(wrap);
    shareLi.insertAdjacentElement("afterend", li);
  }

  function applyState(key, labelOverride) {
    const s = STATES[key];
    if (!s || !btn) return;

    lastStateKey = key;
    lastLabel = labelOverride || null;

    btn.textContent = labelOverride || s.label;
    btn.style.background = s.bg;
    btn.style.color = s.fg;
    btn.disabled = !s.action;
    btn.style.cursor = s.action ? "pointer" : "default";

    if (clickHandler) {
      btn.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
    if (s.action) {
      clickHandler = s.action;
      btn.addEventListener("click", clickHandler);
    }
  }

  // 2 Pending and 3 Processing both mean "Jellyseerr has it, it isn't here yet" —
  // a distinction with no value when you auto-approve your own requests.
  // 1 Unknown, 6 Blocklisted, 7 Deleted and null all mean "not on disk" → offer to add.
  // 4 Partially available is season-level TV semantics and never occurs for films.
  function statusToStateKey(status) {
    switch (status) {
      case 2:
      case 3: return "requested";
      case 4:
      case 5: return "available";
      default: return "add";
    }
  }

  function requestStatus() {
    hasFetched = true;
    applyState("checking");
    currentMeta = extractMeta();
    chrome.runtime.sendMessage({ type: "getStatus", item: currentMeta }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) return void applyState("unreachable");
      if (!resp.configured) return void applyState("setup");
      if (resp.tmdbId) resolvedTmdbId = resp.tmdbId;
      applyState(statusToStateKey(resp.status));
    });
  }

  function openOptions() {
    chrome.runtime.sendMessage({ type: "openOptions" });
  }

  // Sends ids, not a URL — the background rebuilds the link from saved settings
  // so nothing page-side can steer where we open a tab.
  function openMedia() {
    if (!resolvedTmdbId) return;
    chrome.runtime.sendMessage({
      type: "openMedia",
      tmdbId: resolvedTmdbId,
      mediaType: currentMeta?.mediaType || "movie"
    });
  }

  function doAdd() {
    const item = currentMeta || extractMeta();
    applyState("checking", "Adding…");
    chrome.runtime.sendMessage({ type: "addItem", item }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        // Deliberately sticky: no auto-revert, so a failure can't vanish while
        // you're closing the tab. Absence of red is how you know it worked.
        const err = chrome.runtime.lastError?.message || resp?.error;
        applyState("failed", err ? `Failed: ${clamp(err)} — retry` : undefined);
        return;
      }
      if (resp.tmdbId) resolvedTmdbId = resp.tmdbId;
      applyState("requested");
    });
  }

  // Jellyseerr echoes the whole response body on error; keep it button-sized.
  function clamp(text, max = 60) {
    const s = String(text).replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function extractMeta() {
    const title =
      document.querySelector("h1.film-title a")?.textContent?.trim() ||
      document.querySelector("h1.headline-1")?.textContent?.trim() ||
      "";
    const year = Number(document.querySelector(".releaseyear")?.textContent?.trim()) || undefined;

    const tmdb = findTmdbLink();
    return {
      title,
      year,
      tmdbId: tmdb?.tmdbId,
      mediaType: tmdb?.mediaType || "movie"
    };
  }

  function findTmdbLink() {
    const links = Array.from(document.querySelectorAll('a[href*="themoviedb.org/"]'))
      .map((a) => a.getAttribute("href"))
      .filter(Boolean);

    for (const href of links) {
      const m = String(href).match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
      if (m) return { mediaType: m[1] === "tv" ? "tv" : "movie", tmdbId: Number(m[2]) };
    }
    return null;
  }
})();
