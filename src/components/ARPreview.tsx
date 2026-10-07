import { useEffect, useMemo, useRef, useState } from 'react'
import { loadArJs } from '../ar/scripts'
import {
  buildWaypoints,
  distanceRemaining,
  hasArrived,
  nextStep,
  type Destination,
  type Route,
} from '../route'
import type { MapCenter } from '../domain'

interface Props {
  route: Route | null
  routeLoading: boolean
  destination: Destination | null
  origin: MapCenter
  onExit: () => void
}

function stopCameraTracks(root: HTMLElement | null) {
  root
    ?.querySelectorAll('video')
    .forEach((v) => (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()))
}

export default function ARPreview({ route, routeLoading, destination, origin, onExit }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(null)
    loadArJs().then(
      () => {
        if (!cancelled) setReady(true)
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load AR libraries.')
      },
    )
    return () => {
      cancelled = true
      stopCameraTracks(hostRef.current)
      if (hostRef.current) hostRef.current.innerHTML = ''
    }
  }, [])

  const waypoints = useMemo(
    () => (route ? buildWaypoints(route.points, route.steps) : []),
    [route],
  )
  const upcoming = route ? nextStep(origin, route) : null
  const remaining = route ? distanceRemaining(origin, route) : Infinity
  const arrived = destination ? hasArrived(origin, destination) : false

  return (
    <div className="relative h-full w-full bg-black">
      <button
        onClick={onExit}
        className="absolute left-2 top-2 z-20 rounded-lg bg-slate-900/90 px-3 py-2 text-sm font-medium text-slate-100 shadow"
      >
        ← Back to map
      </button>
      {!ready && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-300">
          <span>Loading camera + AR.js…</span>
          <span>Allow camera access when prompted.</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-red-300">
          {error} Check your connection (CDN scripts) and reload.
        </div>
      )}
      {ready && !route && !routeLoading && (
        <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded bg-slate-900/90 px-3 py-1 text-sm">
          No route yet — get a GPS fix on the map first.
        </div>
      )}
      {ready && route && (
        <div className="absolute inset-x-0 top-2 z-10 mx-auto flex w-fit max-w-[90%] flex-col items-center gap-1 rounded bg-slate-900/90 px-3 py-1.5 text-center shadow">
          {arrived ? (
            <span className="text-sm font-semibold text-emerald-300">
              Arrived at {destination?.label}
            </span>
          ) : (
            <>
              <span className="text-sm font-medium">
                {upcoming ? upcoming.instruction : `Head to ${destination?.label ?? 'destination'}`}
              </span>
              <span className="text-xs text-slate-300">
                {Math.round(remaining)} m to go{route.fallback ? ' (direct line)' : ''}
              </span>
            </>
          )}
        </div>
      )}
      {ready && (
        <div ref={hostRef} className="ar-scene-container h-full w-full">
          <a-scene
            embedded
            arjs="sourceType: webcam; videoTexture: true; debugUIEnabled: false;"
            vr-mode-ui="enabled: false"
            renderer="antialias: true; alpha: true"
          >
            {waypoints.map((w, i) => (
              <a-entity
                key={`${w.lat.toFixed(6)}:${w.lng.toFixed(6)}:${i}`}
                gps-entity-place={`latitude: ${w.lat}; longitude: ${w.lng};`}
                geometry={
                  w.maneuverStep !== null
                    ? 'primitive: sphere; radius: 0.9'
                    : 'primitive: sphere; radius: 0.5'
                }
                material={w.maneuverStep !== null ? 'color: #fbbf24' : 'color: #38bdf8'}
              />
            ))}
            {destination && (
              <a-entity
                key={destination.id}
                gps-entity-place={`latitude: ${destination.lat}; longitude: ${destination.lng};`}
                geometry="primitive: sphere; radius: 1.2"
                material="color: #fbbf24"
              />
            )}
            <a-camera gps-camera="gpsMinDistance: 2" rotation-reader />
          </a-scene>
        </div>
      )}
    </div>
  )
}
