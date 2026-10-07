import { useCallback, useEffect, useRef, useState } from 'react'
import {
  OsrmRouteProvider,
  distanceToRoute,
  haversineMeters,
  straightLineFallback,
  type Destination,
  type Route,
} from '../route'
import type { GpsFix } from './useLocation'
import type { MapCenter } from '../domain'

// Same 25m radius as arrival, different meaning: GPS jitter (±5–15m) must
// not trigger a refetch, so the off-route band equals the arrival band.
const OFF_ROUTE_METERS = 25
const OFF_ROUTE_MS = 5000
const REFETCH_MOVE_METERS = 50
const REFETCH_MIN_MS = 10000

interface State {
  route: Route | null
  routeError: string | null
  routeLoading: boolean
}

/** Fetch + maintain the walking route from live GPS to the Destination. */
export function useRoute(
  gps: GpsFix | null,
  destination: Destination | null,
) {
  const [state, setState] = useState<State>({ route: null, routeError: null, routeLoading: false })
  const [nonce, setNonce] = useState(0)
  const providerRef = useRef<OsrmRouteProvider | null>(null)
  const fetchFromRef = useRef<(MapCenter & { at: number }) | null>(null)
  const offRouteTimerRef = useRef<number | null>(null)
  const lastAttemptRef = useRef(0)
  if (!providerRef.current) providerRef.current = new OsrmRouteProvider()

  const fetchRoute = useCallback(
    async (from: MapCenter, dest: Destination, manual: boolean) => {
      const now = Date.now()
      if (!manual && now - lastAttemptRef.current < REFETCH_MIN_MS) return
      lastAttemptRef.current = now
      setState((s) => ({ ...s, routeLoading: true, routeError: null }))
      try {
        const route = await providerRef.current!.route(from, dest)
        fetchFromRef.current = { ...from, at: now }
        setState({ route, routeError: null, routeLoading: false })
      } catch (e) {
        // Offline-ish fallback: straight-line waypoints so the demo still works.
        fetchFromRef.current = { ...from, at: now }
        setState({
          route: straightLineFallback(from, dest),
          routeError: e instanceof Error ? e.message : 'Route request failed.',
          routeLoading: false,
        })
      }
    },
    [],
  )

  // Initial fetch on first GPS fix (or destination appearing).
  useEffect(() => {
    if (!gps || !destination || state.route || state.routeLoading) return
    void fetchRoute(gps, destination, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps, destination, nonce])

  // Auto-refetch: sustained off-route (wall-clock timer, so a stationary
  // user still refires), or moved far from the fetch origin.
  useEffect(() => {
    if (!gps || !destination || !state.route || state.routeLoading) return
    if (offRouteTimerRef.current !== null) {
      window.clearTimeout(offRouteTimerRef.current)
      offRouteTimerRef.current = null
    }
    const off = distanceToRoute(gps, state.route.points)
    if (off > OFF_ROUTE_METERS) {
      offRouteTimerRef.current = window.setTimeout(() => {
        offRouteTimerRef.current = null
        void fetchRoute(gps, destination, false)
      }, OFF_ROUTE_MS)
      return () => {
        if (offRouteTimerRef.current !== null) {
          window.clearTimeout(offRouteTimerRef.current)
          offRouteTimerRef.current = null
        }
      }
    }
    const from = fetchFromRef.current
    if (!from) return
    if (haversineMeters(gps, from) > REFETCH_MOVE_METERS)
      void fetchRoute(gps, destination, false)
  }, [gps, destination, state.route, state.routeLoading, fetchRoute])

  const recalc = useCallback(() => {
    fetchFromRef.current = null
    if (offRouteTimerRef.current !== null) {
      window.clearTimeout(offRouteTimerRef.current)
      offRouteTimerRef.current = null
    }
    setState((s) => ({ ...s, route: null, routeError: null }))
    setNonce((n) => n + 1)
  }, [])

  return { ...state, recalc }
}
