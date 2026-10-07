import { useMemo, useState } from 'react'
import ARPreview from './components/ARPreview'
import MapEditor from './components/MapEditor'
import { useLocation } from './hooks/useLocation'
import { parseAnchors, type Anchor } from './domain'
import anchorsJson from './anchors.json'

type View = 'map' | 'ar'

function loadAnchors(): { anchors: Anchor[]; error: string | null } {
  try {
    return { anchors: parseAnchors(anchorsJson), error: null }
  } catch (e) {
    console.error(e)
    return {
      anchors: [],
      error: e instanceof Error ? e.message : 'Invalid anchors.json.',
    }
  }
}

export default function App() {
  const [view, setView] = useState<View>('map')
  const { anchors, error: anchorsError } = useMemo(loadAnchors, [])
  const { gps, gpsError, permission, requestLocation, requestState, lastAttemptAt } =
    useLocation()

  const denied =
    permission === 'denied' || (!gps && /denied/i.test(gpsError ?? ''))

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h1 className="text-sm font-bold tracking-wide">
          GeoAR <span className="font-normal text-slate-400">Playground</span>
        </h1>
        {gps && (
          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
            GPS ±{Math.round(gps.accuracy)}m
          </span>
        )}
      </header>

      <main className="min-h-0 flex-1">
        {anchorsError ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-300">
            Invalid anchors.json: {anchorsError} Fix src/anchors.json and reload.
          </div>
        ) : !gps ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-slate-300">
              {requestState === 'pending'
                ? 'Requesting location…'
                : (gpsError ?? 'Waiting for GPS…')}
            </p>
            <button
              onClick={requestLocation}
              disabled={requestState === 'pending'}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {requestState === 'pending' ? 'Requesting…' : 'Enable GPS'}
            </button>
            {requestState === 'failed' && lastAttemptAt && (
              <p className="max-w-md text-xs text-amber-200/90">
                Try at {new Date(lastAttemptAt).toLocaleTimeString()} failed with
                no prompt — the block may be in the OS/browser site settings.
              </p>
            )}
            {denied && (
              <p className="max-w-md text-xs text-amber-200/90">
                Location is blocked for this site. Secure context:{' '}
                {window.isSecureContext
                  ? 'yes'
                  : 'no — open this page through the tunnel URL (https://…trycloudflare.com)'}{' '}
                (origin: {window.location.host}). On iPhone check both: Settings
                → Privacy &amp; Security → Location Services (on, Safari Websites
                allowed), and Settings → Apps → Safari → Location (Ask or Allow).
                Then <strong>reload this page</strong> and tap Enable GPS.{' '}
                <button
                  onClick={() => window.location.reload()}
                  className="underline underline-offset-2"
                >
                  Reload now
                </button>
              </p>
            )}
          </div>
        ) : view === 'map' ? (
          <MapEditor
            anchors={anchors}
            center={gps}
            onEnterAr={() => setView('ar')}
          />
        ) : (
          <ARPreview
            anchors={anchors}
            origin={gps}
            onExit={() => setView('map')}
          />
        )}
      </main>
    </div>
  )
}
