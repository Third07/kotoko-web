# Kotoko Web

A separate, mobile-first web client for an authorized Stremio-compatible add-on. It does not modify or depend on Streambox.

## Features

- Add-on catalogs with pagination
- Movie and series details
- Season and aired-episode selection
- Direct HLS and MP4 playback
- Stream switching, retry recovery, fullscreen, and previous/next episode controls
- Browser-managed downloads for direct MP4, MKV, WebM and similar media files
- Multiple protected add-ons with per-device install/remove controls and playback fallback
- Search filtering and sorting
- Watchlist and Continue Watching stored in the browser
- Same-origin Cloudflare Worker adapter that keeps the personalized manifest URL out of public files

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and set `KOTOKO_MANIFEST_URL` to the authorized personalized manifest URL. Add optional extra sources through `KOTOKO_ADDONS`.
3. Run the Worker with `npm run worker:dev`.
4. In another terminal, run the frontend with `npm run dev`.

## Cloudflare deployment

Set the private manifest URL as a Worker secret:

```sh
npx wrangler secret put KOTOKO_MANIFEST_URL
npx wrangler secret put KOTOKO_ADDONS
```

`KOTOKO_ADDONS` is an encrypted JSON array containing up to seven additional sources:

```json
[
  {
    "id": "second-source",
    "manifestUrl": "https://authorized-addon.example/private/manifest.json"
  }
]
```

Each `id` must be unique, lowercase, and contain only letters, numbers, `_` or `-`. The website exposes only sanitized manifests; personalized URLs remain inside Cloudflare. Users can install or remove configured sources per device from **Add-ons**.

Then validate and deploy:

```sh
npm run check
npx wrangler deploy
```

The manifest URL must never be committed to GitHub or placed in frontend JavaScript. Rotate the previously shared personalized URL before production deployment.

## Playback support

Browser playback supports direct HTTPS HLS and MP4/WebM streams. Torrent-only (`infoHash`), debrid-dependent, DRM-protected, or provider-page streams are listed with an explanation but cannot be played directly by this web client.

The download action appears only when an add-on supplies a direct media file URL. HLS playlists, torrents, DRM streams, and sources requiring private request headers are intentionally excluded. Cross-origin download behavior remains controlled by the media host and the user's browser.
