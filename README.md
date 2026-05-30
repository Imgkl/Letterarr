# Letterarr

A Chrome extension that bridges **[Letterboxd](https://letterboxd.com)** and **[Jellyseerr](https://github.com/fallenbagel/jellyseerr)**.

Browse films on Letterboxd, see at a glance which ones are already in your library, and add the rest to your Jellyseerr request queue in one click — without leaving the page.

Letterarr talks only to Jellyseerr, which already orchestrates Radarr/Sonarr and tracks availability through your Jellyfin/Plex/Emby server. One integration, everything downstream handled for you.

## Features

- **Reactive button on every film page.** The injected button reflects the film's live status in Jellyseerr instead of a generic "Add":
  - `Add to Jellyseerr` — not requested yet (click to request)
  - `Requested` / `Processing…` — already in the pipeline
  - `Partially available` — some seasons present (TV)
  - `Available in library` — already available (green)
  - `Set up Letterarr →` — extension not configured yet (opens settings)
  - `⚠ Unreachable — retry` — Jellyseerr is configured but not responding
- **One-click requests** for movies and TV shows, with a TMDB search fallback when the page has no TMDB link.
- **Compact toolbar popup** for settings that auto-verifies your connection every time it opens.

## Install (unpacked)

No build step required.

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the project folder.

## Configure

1. Click the Letterarr toolbar icon to open the popup.
2. Enter your **Jellyseerr URL** (e.g. `http://192.168.1.10:5055`) and **API key**.
3. Hit **Save & verify**. Settings are saved only after the connection is confirmed.

> Find your API key in Jellyseerr under **Settings → General → API Key**.

## Usage

Open any Letterboxd film page (`letterboxd.com/film/...`). The button appears in the film's actions panel and shows the current status automatically. Click it to request anything not already in your library.

## How it works

- A content script injects the button and reads the film's title, year, and TMDB id from the page.
- The background service worker queries Jellyseerr's `/movie` or `/tv` endpoint for `mediaInfo.status`, falling back to `/search` when no TMDB id is present.
- The button renders the matching state; requests are sent to Jellyseerr's `/request` endpoint.

## Tech

Vanilla JavaScript, Chrome Manifest V3. No dependencies, no build tooling.
