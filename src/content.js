(function () {
  if (location.origin !== "https://letterboxd.com") return;
  if (!/^\/film\/[^/]+\/?$/.test(location.pathname)) return;

  const BUTTON_LI_ID = "lbarr-jellyseerr-li";
  const BUTTON_ID = "lbarr-jellyseerr-btn";

  const MAX_TRIES = 20;
  const TRY_DELAY_MS = 250;

  // Jellyseerr MediaStatus: 1 Unknown, 2 Pending, 3 Processing,
  // 4 Partially available, 5 Available.
  const STATES = {
    checking:    { label: "Checking…",             bg: "#2c3440", fg: "#99aabb", clickable: false },
    setup:       { label: "Set up Letterarr →",    bg: "#ff8000", fg: "#14181c", clickable: true, action: openOptions },
    add:         { label: "Add to Jellyseerr",     bg: "#40bcf4", fg: "#14181c", clickable: true, action: doAdd },
    requested:   { label: "Requested",             bg: "#3a4149", fg: "#cbd5e0", clickable: false },
    processing:  { label: "Processing…",           bg: "#3a4149", fg: "#cbd5e0", clickable: false },
    partial:     { label: "Partially available",   bg: "#f08c00", fg: "#14181c", clickable: false },
    available:   { label: "Available in library",  bg: "#00e054", fg: "#14181c", clickable: false },
    unreachable: { label: "⚠ Unreachable — retry", bg: "#e0224a", fg: "#ffffff", clickable: true, action: requestStatus }
  };

  let tries = 0;
  let btn = null;
  let currentMeta = null;
  let clickHandler = null;

  tick();

  function tick() {
    tries += 1;
    if (tries > MAX_TRIES) return;

    const panel = document.querySelector("section#userpanel.actions-panel ul.js-actions-panel");
    if (!panel) return void setTimeout(tick, TRY_DELAY_MS);

    const shareLi = panel.querySelector("li.panel-sharing");
    if (!shareLi) return void setTimeout(tick, TRY_DELAY_MS);

    if (!document.getElementById(BUTTON_LI_ID)) {
      injectButton(shareLi);
      requestStatus();
    }
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

    applyState("checking");
  }

  function applyState(key) {
    const s = STATES[key];
    if (!s || !btn) return;

    btn.textContent = s.label;
    btn.style.background = s.bg;
    btn.style.color = s.fg;
    btn.disabled = !s.clickable;
    btn.style.cursor = s.clickable ? "pointer" : "default";

    if (clickHandler) {
      btn.removeEventListener("click", clickHandler);
      clickHandler = null;
    }
    if (s.clickable && s.action) {
      clickHandler = s.action;
      btn.addEventListener("click", clickHandler);
    }
  }

  function statusToStateKey(status) {
    switch (status) {
      case 2: return "requested";
      case 3: return "processing";
      case 4: return "partial";
      case 5: return "available";
      default: return "add"; // 1 / unknown / null → not requested
    }
  }

  function requestStatus() {
    applyState("checking");
    currentMeta = extractMeta();
    chrome.runtime.sendMessage({ type: "getStatus", item: currentMeta }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) return void applyState("unreachable");
      if (!resp.configured) return void applyState("setup");
      applyState(statusToStateKey(resp.status));
    });
  }

  function openOptions() {
    chrome.runtime.sendMessage({ type: "openOptions" });
  }

  function doAdd() {
    const item = currentMeta || extractMeta();
    applyState("checking");
    btn.textContent = "Adding…";
    chrome.runtime.sendMessage({ type: "addItem", item }, (resp) => {
      if (chrome.runtime.lastError || !resp?.ok) {
        const err = chrome.runtime.lastError?.message || resp?.error;
        btn.textContent = err ? `Failed: ${err}` : "Failed";
        setTimeout(() => applyState("add"), 1800);
        return;
      }
      applyState("requested");
    });
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
