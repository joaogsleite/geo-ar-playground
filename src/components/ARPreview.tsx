import { useEffect, useMemo, useRef, useState } from 'react'
import { loadArJs } from '../ar/scripts'
import { ArJsProvider } from '../ar/providers'
import type { Anchor, MapCenter } from '../domain'

interface Props {
  anchors: Anchor[]
  origin: MapCenter
  onExit: () => void
}

function stopCameraTracks(root: HTMLElement | null) {
  root
    ?.querySelectorAll('video')
    .forEach((v) => (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop()))
}

export default function ARPreview({ anchors, origin, onExit }: Props) {
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

  const specs = useMemo(() => {
    const provider = new ArJsProvider()
    return provider.place(anchors, origin)
  }, [anchors, origin])

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
      {ready && specs.length === 0 && (
        <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded bg-slate-900/90 px-3 py-1 text-sm">
          No anchors in anchors.json.
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
            {specs.map((s) =>
              s.geometry ? (
                <a-entity
                  key={s.key}
                  gps-entity-place={s.placeAttr}
                  geometry={s.geometry}
                  material={s.material}
                  rotation={s.rotation}
                />
              ) : (
                <a-entity
                  key={s.key}
                  gps-entity-place={s.placeAttr}
                  text={s.text}
                  rotation={s.rotation}
                />
              ),
            )}
            <a-camera gps-camera="gpsMinDistance: 2" rotation-reader />
          </a-scene>
        </div>
      )}
    </div>
  )
}
