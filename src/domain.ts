// Domain core: Anchor = content item pinned to lat/lng.
// See GLOSSARY.md. Anchors ship in src/anchors.json; no authoring at runtime.

export type PrimitiveKind = 'box' | 'sphere' | 'cone' | 'cylinder' | 'text'

export const PRIMITIVE_KINDS: PrimitiveKind[] = [
  'box',
  'sphere',
  'cone',
  'cylinder',
  'text',
]

export interface Anchor {
  id: string
  label: string
  kind: PrimitiveKind
  lat: number
  lng: number
  /** Meters above ground. AR.js location-based ignores this. */
  altitude: number
  color: string
  /** Base size in meters (edge length / diameter / glyph height). */
  size: number
  rotationY: number
}

export interface MapCenter {
  lat: number
  lng: number
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/**
 * Validate unknown JSON into Anchor[]. Throws on the first problem so a
 * malformed anchors.json fails fast instead of rendering half a world.
 */
export function parseAnchors(json: unknown): Anchor[] {
  if (!Array.isArray(json)) throw new Error('anchors.json must be an array')
  return json.map((item, i) => {
    const where = `anchors[${i}]`
    if (typeof item !== 'object' || item === null)
      throw new Error(`${where} must be an object`)
    const a = item as Record<string, unknown>
    if (typeof a.id !== 'string' || a.id.length === 0)
      throw new Error(`${where}.id must be a non-empty string`)
    if (typeof a.label !== 'string' || a.label.length === 0)
      throw new Error(`${where}.label must be a non-empty string`)
    if (!PRIMITIVE_KINDS.includes(a.kind as PrimitiveKind))
      throw new Error(
        `${where}.kind must be one of ${PRIMITIVE_KINDS.join('|')}`,
      )
    if (!isFiniteNumber(a.lat) || a.lat < -90 || a.lat > 90)
      throw new Error(`${where}.lat must be a latitude in [-90, 90]`)
    if (!isFiniteNumber(a.lng) || a.lng < -180 || a.lng > 180)
      throw new Error(`${where}.lng must be a longitude in [-180, 180]`)
    if (!isFiniteNumber(a.altitude))
      throw new Error(`${where}.altitude must be a finite number`)
    if (typeof a.color !== 'string' || a.color.length === 0)
      throw new Error(`${where}.color must be a non-empty string`)
    if (!isFiniteNumber(a.size) || a.size <= 0)
      throw new Error(`${where}.size must be a positive number`)
    if (!isFiniteNumber(a.rotationY))
      throw new Error(`${where}.rotationY must be a finite number`)
    return {
      id: a.id,
      label: a.label,
      kind: a.kind,
      lat: a.lat,
      lng: a.lng,
      altitude: a.altitude,
      color: a.color,
      size: a.size,
      rotationY: a.rotationY,
    } as Anchor
  })
}
