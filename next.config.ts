import type { NextConfig } from "next";

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
  async rewrites() {
    if (!authHelper) return [];
    return [
      { source: "/__/auth/:path*", destination: `${authHelper}/__/auth/:path*` },
      { source: "/__/firebase/:path*", destination: `${authHelper}/__/firebase/:path*` },
    ];
  },
};

export default nextConfig;
