// Mock-only, single-file demo of the app (sample data in the browser, no Firebase, no service worker).
// Reuses the real pages, components and mock data layer; next/* imports are shimmed. Two builds:
// - `npm run preview:build` -> preview/dist/index.html, for the claude.ai artifact viewer: routes kept in memory,
//   Excel export through the viewer's download prompt.
// - `npm run build:demo` (mode "demo") -> preview/dist-demo/index.html, for any static host (Netlify): a full HTML
//   page, routes in the URL hash (#/advisor) so back, reload and links work, and normal browser downloads.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const demo = mode === "demo";
  return {
    root: r("."),
    plugins: [react(), tailwindcss(), viteSingleFile()],
    define: {
      "process.env": JSON.stringify({ NEXT_PUBLIC_USE_MOCK: "true" }),
      __HASH_ROUTES__: JSON.stringify(demo),
    },
    resolve: {
      alias: [
        { find: "next/link", replacement: r("./src/shims/link.tsx") },
        { find: "next/navigation", replacement: r("./src/shims/navigation.ts") },
        // src/lib/data/index.ts imports "./firebase"; swap it for a stub so no Firebase or server code is bundled.
        { find: /^\.\/firebase$/, replacement: r("./src/shims/firebase-stub.ts") },
        // The advisor offline copy (service worker) is for the live app only.
        { find: "@/lib/advisor-offline", replacement: r("./src/shims/advisor-offline.ts") },
        // In the artifact viewer, downloads go through its save prompt; static hosts use src/lib/save-file.ts as is.
        ...(demo ? [] : [{ find: "@/lib/save-file", replacement: r("./src/shims/save-file.ts") }]),
        { find: /^@\//, replacement: r("../src") + "/" },
      ],
    },
    css: { postcss: { plugins: [] } },
    build: {
      outDir: r(demo ? "./dist-demo" : "./dist"),
      emptyOutDir: true,
      chunkSizeWarningLimit: 5000,
      rollupOptions: { input: r(demo ? "./demo.html" : "./index.html") },
    },
    logLevel: "warn",
  };
});
