import type { NextConfig } from "next";

// The live app never ships the demo data or demo accounts: a production build (`next build`, which is what
// Firebase App Hosting runs) refuses NEXT_PUBLIC_USE_MOCK=true. Demo mode is for `npm run dev:demo`, the clickable
// preview and the Netlify demo (both built with Vite from preview/), never for the deployed app.
if (process.env.NEXT_PUBLIC_USE_MOCK === "true" && process.env.NODE_ENV === "production" && process.argv.includes("build")) {
  throw new Error("Refusing to build the live app with demo data (NEXT_PUBLIC_USE_MOCK=true). Remove it; demo builds use `npm run build:demo`.");
}

// On Firebase App Hosting the build gets FIREBASE_WEBAPP_CONFIG (the linked web app's settings). Use it for any
// NEXT_PUBLIC_FIREBASE_* value that is not set explicitly, so apphosting.yaml only needs the values that differ.
const webApp: Record<string, string | undefined> = (() => {
  try {
    return JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG ?? "{}");
  } catch {
    return {};
  }
})();
const fromWebApp: Record<string, string | undefined> = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || webApp.apiKey,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || webApp.authDomain,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || webApp.projectId,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || webApp.appId,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || webApp.messagingSenderId,
};
const env = Object.fromEntries(Object.entries(fromWebApp).filter((e): e is [string, string] => Boolean(e[1])));
// Always inlined, even when unset, so the bundler sees `"false" === "true"` and drops the demo data layer (mock.ts,
// its seed and the demo accounts) from the build. Next.js only inlines NEXT_PUBLIC_* values that are set.
env.NEXT_PUBLIC_USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true" ? "true" : "false";

// Different for every build: the advisor service worker (public/advisor-sw.js) is registered with it, so each
// deploy replaces the offline copy of the advisor app. Set in process.env so build workers see the same value.
process.env.NEXT_PUBLIC_BUILD_ID ||= Date.now().toString(36);
env.NEXT_PUBLIC_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;

// Redirect sign-in: Google returns to https://<authDomain>/__/auth/handler. With authDomain set to this app's own
// domain (see README, go-live step 9), these paths are forwarded to Firebase's helper pages, so the whole
// sign-in stays on one domain and works in browsers that block third-party storage (Safari, installed apps).
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const authHelper = process.env.FIREBASE_AUTH_HELPER_ORIGIN || (projectId ? `https://${projectId}.firebaseapp.com` : "");

const nextConfig: NextConfig = {
  // A separate build folder for the emulator end-to-end test (tests/e2e), so it does not replace the normal build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env,
  // Conservative security headers. No script-src CSP on purpose: Firebase Auth's Google pop-up/redirect flow
  // loads scripts and iframes from Google domains; frame-ancestors only stops other sites framing this app.
  async headers() {
    return [
      {
        // Not on /__/* (Firebase Auth's helper pages, proxied below): its auth iframe must be frameable by this app.
        source: "/:path((?!__/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
  async rewrites() {
    if (!authHelper) return [];
    return [
      { source: "/__/auth/:path*", destination: `${authHelper}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${authHelper}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
