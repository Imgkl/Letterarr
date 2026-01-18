(function () {
  if (location.origin !== "https://letterboxd.com") return;
  if (!/^\/film\/[^/]+\/?$/.test(location.pathname)) return;

  const BUTTON_LI_ID = "lbarr-jellyseerr-li";
  const BUTTON_ID = "lbarr-jellyseerr-btn";

  const MAX_TRIES = 20;
  const TRY_DELAY_MS = 250;

  let tries = 0;

  tick();

  function tick() {
    tries += 1;
    if (tries > MAX_TRIES) return;

    const panel = document.querySelector("section#userpanel.actions-panel ul.js-actions-panel");
    if (!panel) return void setTimeout(tick, TRY_DELAY_MS);

    const shareLi = panel.querySelector("li.panel-sharing");
    if (!shareLi) return void setTimeout(tick, TRY_DELAY_MS);

    if (!document.getElementById(BUTTON_LI_ID)) {
      const li = document.createElement("li");
      li.id = BUTTON_LI_ID;
      li.className = "row-fill";

      const wrap = document.createElement("div");
      wrap.setAttribute("role", "none");
      wrap.className = "menuitem -trigger -has-no-icon";

      const btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.setAttribute("role", "menuitem");
      btn.textContent = "Add to Jellyseerr";
      btn.style.display = "block";
      btn.style.width = "100%";
      btn.style.textAlign = "center";

      btn.addEventListener("click", () => {
        const item = extractMeta();
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = "Adding…";
        chrome.runtime.sendMessage({ type: "addItem", item }, (resp) => {
          if (!resp?.ok) {
            btn.textContent = resp?.error ? `Failed: ${resp.error}` : "Failed";
            setTimeout(() => {
              btn.textContent = original;
              btn.disabled = false;
            }, 1500);
            return;
          }
          btn.textContent = "Added";
          setTimeout(() => {
            btn.textContent = original;
            btn.disabled = false;
          }, 1200);
        });
      });

      wrap.appendChild(btn);
      li.appendChild(wrap);
      shareLi.insertAdjacentElement("afterend", li);
    }
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

