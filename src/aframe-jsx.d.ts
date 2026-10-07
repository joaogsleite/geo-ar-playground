// A-Frame custom elements (loaded at runtime via CDN, see src/ar/scripts.ts).
// React has no built-in types for them, so we declare the tags we render.
declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'a-scene': any
        'a-entity': any
        'a-camera': any
      }
    }
  }
}

export {}
