# 0003 — Walking route from GPS to first anchor via OSRM

Date: 2026-10-07
Status: accepted

## Context

The app shows JSON-defined anchors on a map and in AR, but gives no way to
walk to one. The agreed slice: navigate from the live GPS position to the
Destination (`anchors[0]`) on foot, preview the route on the map, follow
waypoint markers in AR.

## Decision

- Destination is always `anchors[0]` (no picker UI).
- Routing via the OSRM demo server (`router.project-osrm.org`, foot
  profile) behind a `RouteProvider` interface (`src/route.ts`), so a keyed
  router (Mapbox) or self-hosted Valhalla can replace it without touching
  views.
- AR renders decimated waypoints (~8m, cap ~100, maneuver points always
  kept) through the existing `gps-entity-place` path; gold destination
  marker; HUD with next instruction + distance remaining; arrival within
  25m.
- Auto-fetch on first GPS fix; auto-refetch when >25m off-route for >5s or
  >50m from the fetch origin; manual Recalculate button; OSRM failure
  falls back to a straight-line waypoint fallback with an error banner.
- Desk testing via hidden `?replay=lat,lng|…` GPS replay (no mock UI).

## Alternatives considered

- Mapbox Directions: better quality but needs a key + billing. Rejected
  for the prototype; the provider interface keeps it available.
- Continuous ribbon/line in AR: real nav feel but needs a custom A-Frame
  component with per-frame GPS projection. Rejected for v1; waypoints
  reuse the proven placement approach.
- Destination picker UI: rejected, the spec fixes the Destination to the
  first JSON anchor.

## Consequences

- New runtime HTTPS dependency: `router.project-osrm.org` (rate-limited
  demo server; failures degrade to the direct-path fallback).
- Phone GPS jitter (±5–15m) bounds guidance precision; thresholds (25m /
  5s / 50m) are tuned for walking, not lanes.
