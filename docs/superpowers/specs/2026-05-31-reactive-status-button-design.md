# Reactive Jellyseerr Status Button — Design

Date: 2026-05-31

## Problem

The "Add to Jellyseerr" button on Letterboxd film pages is static. It says
"Add to Jellyseerr" for every film — even ones already in the library or already
requested. Clicking on an already-available film re-sends a pointless request and
gives no useful feedback. The button does one dumb job regardless of state.

## Goal

Make the button reactive: on every Letterboxd film page, check the film's status
in Jellyseerr and render the button to match — available, requested, processing,
addable, or "extension not set up yet". Stay Jellyseerr-only (no direct Radarr/
Sonarr and no Jellyfin integration); Jellyseerr already knows availability because
it is wired to the media server.

## Non-goals

- No Jellyfin / Plex configuration or deep-linking. The "available" state is a
  non-clickable label, not a play link.
- No direct Radarr/Sonarr calls.
- No new browser permissions (host permissions already cover Jellyseerr).
- No new settings fields.

## Status source

Jellyseerr returns availability via `mediaInfo.status` (an integer) on:

- `GET /api/v1/movie/{tmdbId}`
- `GET /api/v1/tv/{tmdbId}`

`MediaStatus` enum (Overseerr/Jellyseerr):

| value | meaning |
|---|---|
| 1 | Unknown (not requested / not tracked) |
| 2 | Pending (awaiting approval) |
| 3 | Processing (downloading) |
| 4 | Partially available (some seasons — TV) |
| 5 | Available |

If `mediaInfo` is absent on the response, treat as "not requested" (Unknown).

When the page has no TMDB id, fall back to `GET /api/v1/search?query=...` and read
`mediaInfo.status` off the first matching result — the same fallback `performAdd`
already uses to resolve a tmdbId.

## Button states

The button is rendered as a **full-fill pill** (solid background) inside
Letterboxd's actions panel, just after the "Share" row.

| Condition | Label | Clickable | Fill color | Notes |
|---|---|---|---|---|
| Extension not configured (no base URL or API key saved) | `Set up Letterarr →` | yes → opens options page | accent (amber `#ff8000`) | Only when config is genuinely missing |
| No `mediaInfo` / status `1` Unknown | `Add to Jellyseerr` | yes → sends request | actionable (blue `#40bcf4`, dark text) | Current default behavior |
| status `2` Pending | `Requested` | no | muted (`#3a4149`, light text) | |
| status `3` Processing | `Processing…` | no | muted (`#3a4149`, light text) | |
| status `4` Partially available | `Partially available` | no | amber (`#f08c00`) | Mainly TV |
| status `5` Available | `Available in library` | no | green (`#00e054`, dark text) | |
| Configured but Jellyseerr unreachable / status call errored | `⚠ Unreachable — retry` | yes → re-runs the status check | red (`#e0224a`, light text) | Signals the outage up front instead of failing on click |

Colors are tunable during implementation; they are starting values chosen to read
well on Letterboxd's dark theme.

Key distinction: **"not configured"** (no URL/key saved → show *Set up Letterarr*)
is separate from **"configured but unreachable"** (server down → show *Unreachable
— retry*, which re-runs the status check on click). The user is never nagged to set
up something already set up, and an outage is signalled up front rather than only
after clicking Add.

## Flow

1. `content.js` waits for the actions panel and injects the pill (as today),
   initially in a neutral "checking…" / disabled state.
2. `content.js` extracts `{ tmdbId, mediaType, title, year }` (existing
   `extractMeta`) and sends a `getStatus` message to the background worker.
3. Background `getStatus` handler:
   - Builds the Jellyseerr client. If it is `null` (no URL/key) → respond
     `{ ok: true, configured: false }`.
   - Else resolves status: if `tmdbId` present, call `getMedia(tmdbId, mediaType)`;
     otherwise `search(title[+year])` and read first match's `mediaInfo.status`.
   - Respond `{ ok: true, configured: true, status: <int|null> }`.
   - On thrown error respond `{ ok: false, error }` — content treats this as
     "configured but unreachable" → `Unreachable — retry` state.
4. `content.js` `renderState(state)` paints the pill per the table above and wires
   the correct click handler (add request / open options / re-check status / no-op).
   The `Unreachable — retry` state's click handler re-runs `requestStatus()`.
5. On a successful **Add** click, the pill flips directly to the `Requested`
   (Pending) state instead of reverting to `Add`.
6. Clicking `Set up Letterarr →` sends an `openOptions` message; the worker calls
   `chrome.runtime.openOptionsPage()`.

## Code changes (3 files, no new files)

### `src/apiClients.js`
Add to the client returned by `makeJellyseerrClient`:
```js
async getMedia(tmdbId, mediaType) {
  const kind = mediaType === "tv" ? "tv" : "movie";
  return fetchJson(`${base}/api/v1/${kind}/${tmdbId}`, { headers: authHeaders });
}
```
(`getMedia` returns the full detail object; caller reads `.mediaInfo?.status`.)

### `src/background.js`
- Add `getStatus` message handler calling a new `performStatus(item)` that returns
  `{ configured, status }` per the flow above (reuses `getSettings` +
  `makeJellyseerrClient`, and the search fallback already in `performAdd`).
- Add `openOptions` message handler → `chrome.runtime.openOptionsPage()`.

### `src/content.js`
- Refactor `tick()` so button injection, status fetch, and rendering are separable:
  - `injectButton()` — create the pill (once), default to a disabled "checking…".
  - `requestStatus()` — send `getStatus`, then call `renderState(...)`.
  - `renderState(state)` — set label, fill color, disabled, and click handler.
- Move the existing add logic into the `Add` state's click handler; on success call
  `renderState({ status: 2 })` (Requested).
- Add a `Set up Letterarr →` click handler that sends `openOptions`.
- Style the element as a full-fill pill (background color, padding, radius) rather
  than the current plain text menuitem.

## Error handling

- Status check never blocks usage: any failure degrades to a usable state —
  *Set up Letterarr* (unconfigured) or *Unreachable — retry* (network/HTTP error on
  a configured server, click re-checks).
- The Add path keeps its existing error display (`Failed: <error>` then revert).

## Testing (manual — no test harness in repo)

- Film already in library → green `Available in library`, not clickable.
- Film not requested → `Add to Jellyseerr`; click → `Requested`; reload → stays
  `Requested`/`Processing`.
- Pending/processing film → correct muted label, not clickable.
- Extension with no URL/key saved → `Set up Letterarr →`; click opens options page.
- Jellyseerr URL set but server stopped → falls back to `Add to Jellyseerr`; click
  shows the real error.
- TV show page → `tv` endpoint used; partially-available shows amber label.
