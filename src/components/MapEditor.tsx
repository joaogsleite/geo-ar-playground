import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { Anchor, MapCenter } from '../domain'
import type { Destination, Route } from '../route'

interface Props {
  anchors: Anchor[]
  center: MapCenter
  destination: Destination | null
  route: Route | null
  routeLoading: boolean
  routeError: string | null
  onRecalc: () => void
  onEnterAr: () => void
}

function markerIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-50%)">
      <div style="background:${color};color:#0f172a;font:600 11px system-ui;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.5)">${label}</div>
      <div style="width:14px;height:14px;background:${color};border:2px solid #fff;border-radius:50%;margin-top:2px"></div>
    </div>`,
    iconSize: [0, 0],
  })
}

export default function MapEditor({
  anchors,
  center,
  destination,
  route,
  routeLoading,
  routeError,
  onRecalc,
  onEnterAr,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)
  const routeRef = useRef<L.Polyline | null>(null)
  const userDotRef = useRef<L.CircleMarker | null>(null)

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return
    const map = L.map(mapEl.current, { zoomControl: false }).setView(
      [center.lat, center.lng],
      18,
    )
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 21,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const layer = L.layerGroup().addTo(map)
    markersRef.current = layer
    const dot = L.circleMarker([center.lat, center.lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: '#0ea5e9',
      fillOpacity: 1,
    }).addTo(map)
    userDotRef.current = dot

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the user dot on the latest fix without re-centering the map.
  useEffect(() => {
    userDotRef.current?.setLatLng([center.lat, center.lng])
  }, [center])

  // Rebuild read-only markers when anchors change; destination gets a gold ring.
  useEffect(() => {
    const map = mapRef.current
    const layer = markersRef.current
    if (!map || !layer) return
    layer.clearLayers()
    for (const a of anchors) {
      L.marker([a.lat, a.lng], {
        icon: markerIcon(a.color, a.label),
        interactive: false,
      }).addTo(layer)
    }
    if (destination) {
      L.circleMarker([destination.lat, destination.lng], {
        radius: 14,
        color: '#fbbf24',
        weight: 2,
        fill: false,
        interactive: false,
      }).addTo(layer)
    }
  }, [anchors, destination])

  // Route polyline.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    routeRef.current?.remove()
    routeRef.current = null
    if (route && route.points.length > 1) {
      routeRef.current = L.polyline(
        route.points.map((p) => [p.lat, p.lng] as [number, number]),
        { color: route.fallback ? '#94a3b8' : '#38bdf8', weight: 4 },
      ).addTo(map)
    }
  }, [route])

  const recenter = () => {
    mapRef.current?.setView([center.lat, center.lng], 18)
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapEl} className="absolute inset-0 bg-slate-900" />

      <div className="absolute left-2 top-2 z-30 flex gap-2">
        <button
          onClick={recenter}
          className="rounded-lg bg-slate-900/90 px-3 py-2 text-sm font-medium text-slate-100 shadow"
        >
          Center on me
        </button>
      </div>

      <div className="absolute right-2 top-2 z-30 flex max-w-55 flex-col items-end gap-1">
        {routeLoading && (
          <span className="rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 shadow">
            Finding walking route…
          </span>
        )}
        {route && !routeLoading && (
          <span className="rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 shadow">
            {route.distance < 1000
              ? `${Math.round(route.distance)} m walk`
              : `${(route.distance / 1000).toFixed(1)} km walk`}
            {route.fallback ? ' (direct)' : ''} → {destination?.label ?? 'destination'}
          </span>
        )}
        {routeError && (
          <span className="rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs text-amber-200 shadow">
            Route offline: {routeError}
          </span>
        )}
        {route && !routeLoading && (
          <button
            onClick={onRecalc}
            className="rounded-lg bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 shadow"
          >
            Recalculate
          </button>
        )}
      </div>

      <div className="absolute inset-x-2 bottom-4 z-30 flex justify-center">
        <button
          onClick={onEnterAr}
          className="rounded-xl bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-lg"
        >
          Enter AR
        </button>
      </div>
    </div>
  )
}
