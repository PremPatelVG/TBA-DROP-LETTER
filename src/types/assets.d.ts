// Static image module declarations (e.g. `import logo from "...tba-logo.webp"`).
//
// Next normally writes these into the generated (git-ignored) next-env.d.ts; we
// reference them directly so `tsc --noEmit` type-checks image imports even when
// `next build` has not been run yet (CI runs tsc on its own). A `*.webp` import
// is typed as Next's StaticImageData ({ src, width, height, ... }); the Vite
// preview build instead resolves it to an inlined `data:` URI string, which the
// brand component normalises at runtime.
/// <reference types="next/image-types/global" />
