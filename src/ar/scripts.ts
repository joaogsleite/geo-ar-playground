// Runtime loader for the AR libraries.
//
// A-Frame + AR.js ship with a GitHub-pinned transitive dep
// (three-bmfont-text) that this repo's npm setup refuses to fetch, and both
// libs are documented to run from CDN builds anyway. So instead of bundling
// them, we lazy-load pinned CDN scripts only when the AR view mounts.
// The map view never downloads them.

export const AFRAME_VERSION = '1.6.0'
export const ARJS_VERSION = '3.4.8'

export const AFRAME_URL = `https://cdn.jsdelivr.net/npm/aframe@${AFRAME_VERSION}/dist/aframe-master.min.js`
export const ARJS_URL = `https://cdn.jsdelivr.net/npm/@ar-js-org/ar.js@${ARJS_VERSION}/aframe/build/aframe-ar.js`

const loaded = new Map<string, Promise<void>>()

function injectScript(src: string): Promise<void> {
  const existing = loaded.get(src)
  if (existing) return existing
  const promise = new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-ar-src="${src}"]`)) {
      resolve()
      return
    }
    const el = document.createElement('script')
    el.src = src
    el.async = false
    el.dataset.arSrc = src
    el.onload = () => resolve()
    el.onerror = () => {
      loaded.delete(src)
      reject(new Error(`Failed to load AR script: ${src}`))
    }
    document.head.appendChild(el)
  })
  loaded.set(src, promise)
  return promise
}

/** Load A-Frame (AR.js dependency). */
export function loadAframe(): Promise<void> {
  return injectScript(AFRAME_URL)
}

/** Load A-Frame + AR.js location-based (real device camera). */
export function loadArJs(): Promise<void> {
  return loadAframe().then(() => injectScript(ARJS_URL))
}
