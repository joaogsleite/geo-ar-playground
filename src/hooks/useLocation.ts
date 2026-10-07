import { useCallback, useEffect, useState } from 'react'
import type { MapCenter } from '../domain'

export interface GpsFix extends MapCenter {
  accuracy: number
  timestamp: number
}

/**
 * Parse a dev-only `?replay=lat,lng|lat,lng` track into fake GPS fixes.
 * Returns null when absent or invalid. Dev builds only.
 */
function parseReplayTrack(): GpsFix[] | null {
  if (!import.meta.env.DEV) return null
  try {
    const raw = new URLSearchParams(window.location.search).get('replay')
    if (!raw) return null
    const pts = raw
      .split(/[|;]/)
      .map((pair) => pair.split(',').map(Number))
      .filter(
        ([la, ln]) =>
          Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180,
      )
      .map(([lat, lng], i) => ({ lat, lng, accuracy: 5, timestamp: Date.now() + i }))
    return pts.length > 0 ? pts : null
  } catch {
    return null
  }
}
/**
 * Live GPS only. No manual/mock override: the map and AR gate on a real fix.
 *
 * Dev-only exception: `?replay=lat,lng|lat,lng` feeds a canned track as fake
 * GPS (cycles every 2.5s) for desk testing. Hidden, no UI surface, stripped
 * from production builds.
 *
 * A load-time watchPosition alone often never surfaces a browser prompt, so
 * we also expose the permission state and a gesture-driven
 * requestLocation() for an explicit "Enable GPS" button.
 */
export function useLocation() {
  const [gps, setGps] = useState<GpsFix | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [permission, setPermission] = useState<PermissionState | 'unsupported'>(
    'unsupported',
  )
  const [requestState, setRequestState] = useState<'idle' | 'pending' | 'failed'>(
    'idle',
  )
  const [lastAttemptAt, setLastAttemptAt] = useState<number | null>(null)
  const [replay] = useState<GpsFix[] | null>(parseReplayTrack)

  const applyFix = useCallback((p: GeolocationPosition) => {
    setGps({
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy,
      timestamp: p.timestamp,
    })
    setGpsError(null)
  }, [])

  const applyError = useCallback((e: GeolocationPositionError) => {
    setGpsError(
      e.code === e.PERMISSION_DENIED
        ? 'Location permission denied.'
        : e.message || 'Location unavailable.',
    )
  }, [])

  useEffect(() => {
    if (replay) {
      setGps(replay[0])
      setGpsError(null)
      if (replay.length < 2) return
      let i = 0
      const id = window.setInterval(() => {
        i = (i + 1) % replay.length
        setGps({ ...replay[i], timestamp: Date.now() })
        setGpsError(null)
      }, 2500)
      return () => window.clearInterval(id)
    }
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not available in this browser.')
      return
    }
    const id = navigator.geolocation.watchPosition(applyFix, applyError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    })
    return () => navigator.geolocation.clearWatch(id)
  }, [applyFix, applyError, replay])

  useEffect(() => {
    let status: PermissionStatus | null = null
    let cancelled = false
    if (!('permissions' in navigator)) return
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (cancelled) {
          return
        }
        status = s
        setPermission(s.state)
        s.addEventListener('change', () => setPermission(s.state))
      })
      .catch(() => {
        // Permissions API present but geolocation query unsupported.
      })
    return () => {
      cancelled = true
      status?.removeEventListener('change', () => setPermission(status!.state))
    }
  }, [])

  /** Gesture-safe one-shot request: call from a button click to force the prompt. */
  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation is not available in this browser.')
      return
    }
    // Stamp every attempt: on iOS a settings-level denial fails instantly
    // with an unchanged message, which otherwise looks like "nothing happened".
    setRequestState('pending')
    setLastAttemptAt(Date.now())
    navigator.geolocation.getCurrentPosition(
      (p) => {
        applyFix(p)
        setRequestState('idle')
      },
      (e) => {
        applyError(e)
        setRequestState('failed')
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
      },
    )
  }, [applyFix, applyError])

  return {
    gps,
    gpsError,
    permission,
    requestLocation,
    requestState,
    lastAttemptAt,
  }
}
