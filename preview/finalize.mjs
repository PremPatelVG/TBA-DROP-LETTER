// Finishes the single-file builds (see vite.config.ts).
// - Artifact build (preview/dist): moves <title> to the top (the artifact host reads it from the first 8KB).
// - Demo build (`node preview/finalize.mjs demo`, preview/dist-demo): names the page index.html for static hosts.
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";

if (process.argv[2] === "demo") {
  const dir = new URL("./dist-demo/", import.meta.url);
  const index = new URL("index.html", dir);
  renameSync(new URL("demo.html", dir), index);
  // Vite emits the icon as its own file; inline it too, so the demo is one self-contained page.
  let html = readFileSync(index, "utf8").replace(/href="\.\/([\w.-]+\.png)"/g, (_, name) => {
    const icon = new URL(name, dir);
    const data = readFileSync(icon).toString("base64");
    rmSync(icon);
    return `href="data:image/png;base64,${data}"`;
  });
  // Make the hosted demo installable on phones like the real app: the same manifest and TBA icons, the iPhone
  // home-screen tags, and a small service worker (network first, last copy of the page kept for offline opening).
  const pub = new URL("../public/", import.meta.url);
  cpSync(new URL("manifest.webmanifest", pub), new URL("manifest.webmanifest", dir));
  cpSync(new URL("icons/", pub), new URL("icons/", dir), { recursive: true });
  writeFileSync(
    new URL("sw.js", dir),
    `const C = "tba-demo-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copy = r.clone(); caches.open(C).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
`,
  );
  const head = [
    '<link rel="manifest" href="/manifest.webmanifest">',
    '<meta name="theme-color" content="#15803d">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Drop Letter">',
    '<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"));</script>',
  ].join("\n");
  // The inlined JS bundle itself contains the text "</head>" (the Excel library), so insert before the LAST one,
  // which is the page's real </head>. Replacing the first one breaks the script and leaves a blank page.
  const end = html.lastIndexOf("</head>");
  html = html.slice(0, end) + head + "\n" + html.slice(end);
  writeFileSync(index, html);
  console.log(`preview/dist-demo/index.html ${(html.length / 1024).toFixed(0)} KB`);
  console.log("Netlify Drop: drag the folder preview/dist-demo onto https://app.netlify.com/drop");
} else {
  const f = new URL("./dist/index.html", import.meta.url);
  let html = readFileSync(f, "utf8");
  const title = "<title>TBA Drop Letter Preview</title>";
  html = title + "\n" + html.replace(title, "");
  writeFileSync(f, html);
  console.log(`preview/dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
}
