import { NextResponse } from "next/server";

/**
 * Digital Asset Links for the advisor Android app (README, "Android app for advisors"). When this lists the app's
 * package name and the SHA-256 fingerprint of its signing key, Chrome trusts the app and opens it full screen,
 * without the browser address bar. Set by environment variables (apphosting.yaml):
 *   ANDROID_PACKAGE_NAME  default com.tba.dropletter
 *   ANDROID_CERT_SHA256   one or more fingerprints, separated by commas (your key, plus Google Play's if you publish there)
 */
export const dynamic = "force-dynamic";

const DEFAULT_PACKAGE = "com.tba.dropletter";
const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

/** "ab:cd:..." or "ABCD..." (with or without a "SHA256:" label) to "AB:CD:...", or null if it is not a SHA-256. */
function fingerprint(value: string): string | null {
  const hex = value.trim().replace(/^sha-?256\s*:?\s*/i, "").replace(/[:\s-]/g, "").toUpperCase();
  return /^[0-9A-F]{64}$/.test(hex) ? hex.match(/../g)!.join(":") : null;
}

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE;
  const fingerprints = [...new Set((process.env.ANDROID_CERT_SHA256 ?? "").split(/[,;\s]+/).map(fingerprint).filter((f): f is string => !!f))];
  const statements = PACKAGE.test(packageName) && fingerprints.length
    ? [{
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: fingerprints },
      }]
    : [];
  return NextResponse.json(statements, { headers: { "Cache-Control": "public, max-age=300" } });
}
