// Routing domain: Destination = anchors[0]; Route = OSRM walking route
// from live GPS to the Destination, rendered as waypoints.
// See GLOSSARY.md. Pure logic here (testable); fetching lives in the provider.

import type { Anchor, MapCenter } from './domain'

export type Destination = Anchor

export function destinationOf(anchors: Anchor[]): Destination | null {
  return anchors.length > 0 ? anchors[0] : null
}

export interface RoutePoint extends MapCenter {}

export interface RouteStep {
  instruction: string
  distance: number
  duration: number
  location: RoutePoint
}

export interface Route {
  points: RoutePoint[]
  steps: RouteStep[]
  distance: number
  duration: number
  fallback: boolean
}

export interface Waypoint extends RoutePoint {
  maneuverStep: number | null
}

export interface RouteProvider {
  readonly id: string
  route(from: MapCenter, to: MapCenter): Promise<Route>
}

/** Great-circle distance in meters. */
export function haversineMeters(a: MapCenter, b: MapCenter): number {
  const r = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(s))
}

export function totalDistance(points: RoutePoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i])
  return d
}

/** Decode a polyline5 (OSRM default) into lat/lng points. */
export function decodePolyline(encoded: string): RoutePoint[] {
  const points: RoutePoint[] = []
  let lat = 0
  let lng = 0
  let i = 0
  while (i < encoded.length) {
    let shift = 0
    let result = 0
    let b: number
    do {
      b = encoded.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dLat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dLat
    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dLng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dLng
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

/** Index of the entry in points nearest to p. */
function nearestIndex(p: MapCenter, points: { lat: number; lng: number }[]): number {
  let best = 0
  let bestD = Infinity
  points.forEach((q, i) => {
    const d = haversineMeters(p, q)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * Decimate dense geometry to waypoints ~stepMeters apart (cap max), always
 * keeping maneuver locations and the final destination.
 */
export function buildWaypoints(
  points: RoutePoint[],
  steps: RouteStep[],
  stepMeters = 8,
  max = 100,
): Waypoint[] {
  if (points.length === 0) return []
  if (points.length === 1) return [{ ...points[0], maneuverStep: null }]
  // Cumulative distance along the geometry.
  const cum: number[] = [0]
  for (let i = 1; i < points.length; i++)
    cum.push(cum[i - 1] + haversineMeters(points[i - 1], points[i]))

  const samples: { index: number; point: RoutePoint }[] = [{ index: 0, point: points[0] }]
  let nextAt = stepMeters
  for (let i = 1; i < points.length; i++) {
    while (cum[i] >= nextAt && nextAt < cum[cum.length - 1]) {
      const t = (nextAt - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9)
      samples.push({
        index: i,
        point: {
          lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
          lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
        },
      })
      nextAt += stepMeters
    }
  }
  samples.push({ index: points.length - 1, point: points[points.length - 1] })

  // Merge maneuver locations not already covered by a nearby sample.
  const merged = [...samples]
  for (const s of steps) {
    const best = nearestIndex(s.location, points)
    const covered = merged.some(
      (m) => haversineMeters(m.point, s.location) < stepMeters / 2,
    )
    if (!covered) {
      let at = merged.findIndex((m) => m.index > best)
      if (at === -1) at = merged.length
      merged.splice(at, 0, { index: best, point: { ...s.location } })
    }
  }

  // Tag samples nearest each maneuver.
  let waypoints: Waypoint[] = merged.map((m) => ({ ...m.point, maneuverStep: null }))
  steps.forEach((s, si) => {
    const best = nearestIndex(s.location, waypoints)
    if (haversineMeters(waypoints[best], s.location) < stepMeters)
      waypoints[best].maneuverStep = si
  })
  // Hard cap: keep first + destination + maneuvers, thin the rest evenly.
  if (waypoints.length > max && max >= 2) {
    const maneuverAt = new Set<number>()
    waypoints.forEach((w, i) => {
      if (w.maneuverStep !== null) maneuverAt.add(i)
    })
    const slots = Math.max(0, max - maneuverAt.size - 2)
    const rest = waypoints
      .map((w, i) => ({ w, i }))
      .filter(({ i }) => i !== 0 && i !== waypoints.length - 1 && !maneuverAt.has(i))
    const keep = new Set<number>([0, waypoints.length - 1, ...maneuverAt])
    if (rest.length > 0 && slots > 0) {
      const stride = rest.length / slots
      for (let k = 0; k < slots; k++) keep.add(rest[Math.floor(k * stride)].i)
    }
    waypoints = waypoints.filter((_, i) => keep.has(i))
  }
  return waypoints
}

/** Straight-line fallback: interpolate origin→destination every stepMeters. */
export function straightLineFallback(
  from: MapCenter,
  to: MapCenter,
  stepMeters = 8,
  max = 100,
): Route {
  const dist = haversineMeters(from, to)
  const n = Math.min(max - 1, Math.max(1, Math.ceil(dist / stepMeters)))
  const points: RoutePoint[] = []
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 1 : i / n
    points.push({ lat: from.lat + (to.lat - from.lat) * t, lng: from.lng + (to.lng - from.lng) * t })
  }
  return {
    points,
    steps: [],
    distance: dist,
    duration: 0,
    fallback: true,
  }
}

/** Index of the route point nearest to p. */
export function nearestRouteIndex(p: MapCenter, points: RoutePoint[]): number {
  return nearestIndex(p, points)
}

export function distanceToRoute(p: MapCenter, points: RoutePoint[]): number {
  if (points.length === 0) return Infinity
  return haversineMeters(p, points[nearestRouteIndex(p, points)])
}

export function distanceRemaining(p: MapCenter, route: Route): number {
  if (route.points.length === 0) return Infinity
  const idx = nearestRouteIndex(p, route.points)
  let d = haversineMeters(p, route.points[idx])
  for (let i = idx + 1; i < route.points.length; i++)
    d += haversineMeters(route.points[i - 1], route.points[i])
  return d
}

/**
 * Nearest step more than ~10m away, so the HUD advances as the user walks
 * instead of sticking on the first step behind them.
 */
export function nextStep(p: MapCenter, route: Route): RouteStep | null {
  let best: RouteStep | null = null
  let bestD = Infinity
  for (const s of route.steps) {
    const d = haversineMeters(p, s.location)
    if (d > 10 && d < bestD) {
      bestD = d
      best = s
    }
  }
  return best
}

export function hasArrived(p: MapCenter, destination: MapCenter, meters = 25): boolean {
  return haversineMeters(p, destination) < meters
}

const OSRM_BASE = 'https://router.project-osrm.org'

function stepInstruction(
  type: string,
  modifier: string | undefined,
  name: string,
): string {
  const road = name ? ` onto ${name}` : ''
  if (type === 'depart') return `Head out${road}`
  if (type === 'arrive') return 'You have arrived'
  if (type === 'roundabout' || type === 'rotary') return `Take the roundabout${road}`
  if (type === 'turn' || type === 'new name' || type === 'continue') {
    return modifier ? `Turn ${modifier}${road}` : `Continue${road || ' straight'}`
  }
  return `${type}${modifier ? ` ${modifier}` : ''}${road}`.trim()
}

/** OSRM walking router (demo server, no key). */
export class OsrmRouteProvider implements RouteProvider {
  readonly id = 'osrm'
  private base: string
  constructor(base: string = OSRM_BASE) {
    this.base = base
  }

  async route(from: MapCenter, to: MapCenter): Promise<Route> {
    const url =
      `${this.base}/route/v1/foot/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=polyline&steps=true`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`OSRM request failed (HTTP ${res.status})`)
    const json = (await res.json()) as {
      code: string
      routes?: {
        geometry: string
        distance: number
        duration: number
        legs?: {
          steps?: {
            maneuver: { type: string; modifier?: string; location: [number, number] }
            name?: string
            distance: number
            duration: number
          }[]
        }[]
      }[]
    }
    if (json.code !== 'Ok' || !json.routes?.[0])
      throw new Error(`OSRM error: ${json.code}`)
    const r = json.routes[0]
    const points = decodePolyline(r.geometry)
    const steps: RouteStep[] = (r.legs ?? []).flatMap((leg) =>
      (leg.steps ?? []).map((s) => ({
        instruction: stepInstruction(s.maneuver.type, s.maneuver.modifier, s.name ?? ''),
        distance: s.distance,
        duration: s.duration,
        location: { lat: s.maneuver.location[1], lng: s.maneuver.location[0] },
      })),
    )
    return { points, steps, distance: r.distance, duration: r.duration, fallback: false }
  }
}
