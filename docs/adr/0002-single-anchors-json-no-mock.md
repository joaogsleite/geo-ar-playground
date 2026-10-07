# 0002 — Single anchors.json, GPS-gated map → AR

Date: 2026-10-07
Status: accepted

## Context

v1 was an authoring playground: multiple scenes, click-to-add/drag anchors on
a Leaflet map, mock lat/lng override, simulated 3D preview, localStorage
persistence, JSON import/export. That flexibility cost complexity (three tabs,
scene CRUD, two AR modes, two location sources) for a use case that is now a
fixed demo: show a curated set of anchors in AR.

## Decision

- Anchors live only in bundled `src/anchors.json`, validated at load by
  `parseAnchors` (fails fast on malformed entries).
- No `Scene` concept, no authoring UI, no localStorage, no import/export.
- No mock/manual location: real GPS only, full gate (no map until a fix).
- One flow: map (read-only) → `Enter AR` → live AR.js camera → back to map.
- Delete the simulated preview and `SimulatedProvider`; keep the
  `AnchorProvider` interface with the single `ArJsProvider`.

## Alternatives considered

- `public/anchors.json` fetched at runtime: editable without rebuild, but no
  build-time type safety and an extra failure mode. Rejected.
- Keep a fallback center so the map renders without GPS: rejected, it hides
  the GPS requirement and AR needs the fix anyway.
- Keep `sim` mode for desktop testing: rejected, it doubled the AR code path
  for a device-only app.

## Consequences

- Editing anchors = editing code + rebuild. Fine for a demo bundle.
- Desktop without GPS shows only the GPS gate; AR requires a phone with GPS
  + camera over HTTPS (tunnel URL).
- Glossary term `Scene` is retired.
