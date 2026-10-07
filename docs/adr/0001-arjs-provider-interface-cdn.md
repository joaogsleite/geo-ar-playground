# AR.js behind an anchor-provider interface, loaded from CDN

AR.js location-based is our v1 anchoring engine, but views depend on the `AnchorProvider` interface (`src/ar/providers.ts`), not on AR.js directly — so a future Google Geospatial (VPS) provider slots in without touching the UI. A-Frame + AR.js load from pinned CDN scripts at runtime (`src/ar/scripts.ts`) instead of npm because A-Frame's GitHub-pinned transitive dep is unfetchable with this repo's npm setup, and both libs are documented to run from CDN builds anyway.

## Considered Options

- **Bundle via npm**: blocked and painful (see above); would also bloat the authoring view.
- **Google Geospatial API now**: most accurate, but needs API key + billing + Chrome-on-Android; deferred behind the stub `GeospatialApiProvider`.
