/*
 * Service worker for the advisor app (registered from the advisor pages with scope /advisor, so the operations
 * and master pages are never controlled by it). It keeps a copy of the advisor app's pages and their scripts,
 * styles and fonts, so the app opens without signal. The data itself is kept by Firestore's offline storage.
 *
 * - Pages under /advisor: from the network when it answers within a few seconds, otherwise the stored copy.
 * - /_next/static/* (file names change with every build): from the stored copy, else the network.
 * - Everything else (data, sign-in, server actions) is not touched.
 *
 * The page registers /advisor-sw.js?v=<build id>, so every deploy installs a fresh copy and removes the old one.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const CACHE = `tba-advisor-${VERSION}`;
const SHELLS = ["/advisor", "/advisor/drops/new", "/advisor/responses", "/advisor/leads", "/advisor/drop"];
const EXTRAS = ["/advisor.webmanifest", "/icons/advisor-192.png", "/icons/advisor-512.png"];
const NETWORK_TIMEOUT_MS = 4000;

/** Script, style and font files a page needs, found in its HTML (tags and the inline route data). */
function assetsOf(html) {
  const found = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s<>\\)]+/g)) found.add(m[0]);
  for (const m of html.matchAll(/(?<![\w/])static\/(?:chunks|css|media)\/[^"'\s<>\\)]+/g)) found.add(`/_next/${m[0]}`);
  return [...found];
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const assets = new Set(EXTRAS);
    for (const path of SHELLS) {
      const res = await fetch(path, { cache: "reload", credentials: "same-origin" });
      if (!res.ok) throw new Error(`${path}: ${res.status}`);
      await cache.put(path, res.clone());
      for (const a of assetsOf(await res.text())) assets.add(a);
    }
    await Promise.all([...assets].map(async (a) => {
      if (await cache.match(a)) return;
      const res = await fetch(a, { credentials: "same-origin" });
      if (res.ok) await cache.put(a, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("tba-advisor-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:24px">
<h1 style="font-size:20px">You are offline</h1><p>This page is not saved on this phone yet.</p>
<p><a href="/advisor" style="color:#15803d">Open the advisor home page</a></p></body>`;

async function page(request) {
  const cache = await caches.open(CACHE);
  const key = new URL(request.url).pathname;
  const network = fetch(request).then(async (res) => {
    if (res.ok && !res.redirected && (res.headers.get("content-type") || "").includes("text/html")) {
      await cache.put(key, res.clone());
    }
    return res;
  });
  network.catch(() => {}); // a failure is handled below
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS, null));
  const first = await Promise.race([network, timeout]).catch(() => null); // null: no connection or too slow
  if (first) return first;
  const stored = await cache.match(key);
  if (stored) return stored;
  // Nothing stored for this page: keep waiting for the network.
  return network.catch(() => new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

async function staticFile(request) {
  const cache = await caches.open(CACHE);
  const stored = await cache.match(request, { ignoreSearch: true });
  if (stored) return stored;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function storedThenUpdate(request) {
  const cache = await caches.open(CACHE);
  const stored = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(async (res) => {
    if (res.ok) await cache.put(request, res.clone());
    return res;
  });
  network.catch(() => {}); // offline: the stored copy (if any) is enough
  return stored ?? network;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (url.pathname === "/advisor" || url.pathname.startsWith("/advisor/")) event.respondWith(page(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticFile(request));
    return;
  }
  if (url.pathname === "/advisor.webmanifest" || url.pathname.startsWith("/icons/")) {
    event.respondWith(storedThenUpdate(request));
  }
});
