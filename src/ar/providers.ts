// Anchor-provider abstraction.
//
// v2 ships a single live provider: ArJsProvider (keyless, raw-GPS
// location-based AR). The interface stays so a future provider (e.g. Google
// Geospatial VPS) can slot in behind it.

import type { Anchor, MapCenter } from '../domain'

export interface EntitySpec {
  key: string
  /** Extra A-Frame attributes for real-GPS placement. */
  placeAttr?: string
  geometry: string
  material: string
  text?: string
  rotation?: string
}

function entityBody(anchor: Anchor): Pick<EntitySpec, 'geometry' | 'material' | 'text' | 'rotation'> {
  const { size, color, rotationY, label, kind } = anchor
  if (kind === 'text') {
    return {
      geometry: '',
      material: '',
      text: `value: ${label}; color: ${color}; width: ${size * 2}; align: center`,
      rotation: `0 ${rotationY} 0`,
    }
  }
  const dims =
    kind === 'box'
      ? `primitive: box; width: ${size}; height: ${size}; depth: ${size}`
      : kind === 'sphere'
        ? `primitive: sphere; radius: ${size / 2}`
        : kind === 'cone'
          ? `primitive: cone; radiusBottom: ${size / 2}; height: ${size * 1.5}`
          : `primitive: cylinder; radius: ${size / 2}; height: ${size * 2}`;
  return {
    geometry: dims,
    material: `color: ${color}`,
    rotation: `0 ${rotationY} 0`,
  }
}

export interface AnchorProvider {
  readonly id: string
  place(anchors: Anchor[], origin: MapCenter): EntitySpec[]
}

/** Real-device AR: anchors placed by lat/lng for AR.js gps-entity-place. */
export class ArJsProvider implements AnchorProvider {
  readonly id = 'arjs'
  place(anchors: Anchor[], _origin: MapCenter): EntitySpec[] {
    return anchors.map((a) => ({
      key: a.id,
      placeAttr: `latitude: ${a.lat}; longitude: ${a.lng};`,
      ...entityBody(a),
    }))
  }
}
