# GeoAR Playground

A location-based Geospatial WebAR playground: **anchors** defined in
`src/anchors.json` are shown on a 2D map, then viewed anchored at real-world
coordinates through a mobile camera. See `GLOSSARY.md` for the domain language.

## Stack

- Vite + React + TypeScript (strict), Tailwind CSS v4
- 2D map: Leaflet + OpenStreetMap (no API key), read-only
- AR: AR.js location-based + A-Frame behind an `AnchorProvider` interface,
  lazy-loaded from pinned CDN (see `docs/adr/0001-arjs-provider-interface-cdn.md`
  and `docs/adr/0002-single-anchors-json-no-mock.md`)
- No backend, no persistence: anchors ship in `src/anchors.json`
- PWA manifest + Cloudflare-tunnel testing (public HTTPS comes from the tunnel)

## Run it

Requires Node 24 via nvm (see `.nvmrc` if present, else `nvm use 24`):

```sh
npm install
npm run dev        # local plain-HTTP dev server
npm run tunnel     # dev server + temp public URL (trycloudflare.com) — use this for all phone testing
npm run build      # typecheck + production bundle
npm run preview    # serve dist/ locally over plain HTTP
```

`npm run tunnel` needs `cloudflared` (`brew install cloudflared`). It starts
Vite on port 5173 (plain HTTP) and tunnels it, then prints something like
`https://<random>.trycloudflare.com` — send that link.
`PORT=8080 npm run tunnel` uses a different local port. Ctrl+C stops both.

Camera + geolocation need a secure context: the tunnel URL is HTTPS, so it
qualifies. A real GPS fix is required — the app waits for it before showing
the map, and AR needs a phone with GPS + camera.

## Anchors

Edit `src/anchors.json` (validated at load by `parseAnchors` in
`src/domain.ts`), then rebuild.
