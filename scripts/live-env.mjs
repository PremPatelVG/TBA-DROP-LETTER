// The environment variables the live app needs on Netlify, and a check of them. Used by scripts/netlify-build.mjs
// (every Netlify build) and by the unit tests. Only names and shapes are checked; values are never printed.

/** Set on Netlify with the scope "Builds" (they are public and baked into the page; not secret). */
export const BUILD_VARS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];
/** Set on Netlify with the scope "Functions", marked "Contains secret values" where noted in the README. */
export const SERVER_VARS = ["FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
export const EMAIL_VARS = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "APP_URL"];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ errors: string[], warnings: string[] }} errors stop a production build; warnings do not.
 */
export function checkLiveEnv(env) {
  const errors = [];
  const warnings = [];
  const has = (k) => Boolean(env[k]?.trim());

  if (env.NEXT_PUBLIC_USE_MOCK === "true") errors.push("NEXT_PUBLIC_USE_MOCK is \"true\": the live app must not use demo data. Delete that variable.");
  const missingBuild = BUILD_VARS.filter((k) => !has(k));
  if (missingBuild.length) errors.push(`Firebase web settings missing: ${missingBuild.join(", ")} (Firebase console > Project settings > Your apps > Web app).`);

  const hasPair = has("FIREBASE_CLIENT_EMAIL") && has("FIREBASE_PRIVATE_KEY");
  if (!hasPair && !has("FIREBASE_SERVICE_ACCOUNT_KEY")) {
    errors.push("Server credentials missing: FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY (from the service account key file). Without them, adding people and resetting passwords fail.");
  } else if (has("FIREBASE_PRIVATE_KEY") && !/BEGIN PRIVATE KEY/.test(env.FIREBASE_PRIVATE_KEY)) {
    errors.push("FIREBASE_PRIVATE_KEY does not look like a private key: paste the whole private_key value, from -----BEGIN PRIVATE KEY----- to -----END PRIVATE KEY-----.");
  }

  const auth = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim();
  if (auth && /^https?:\/\//.test(auth)) errors.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is a bare domain, without https://.");
  else if (auth && auth.endsWith(".firebaseapp.com")) {
    warnings.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is the firebaseapp.com domain: sign-in in the home-screen app and on iPhones needs the app's own domain (README, go-live step 9).");
  }

  const missingEmail = EMAIL_VARS.filter((k) => !has(k));
  if (missingEmail.length) warnings.push(`Welcome emails are off until these are set: ${missingEmail.join(", ")}.`);
  const appUrl = env.APP_URL?.trim();
  if (appUrl && !/^https:\/\/[^\s/]+/.test(appUrl)) errors.push("APP_URL must be the app's full address, starting with https://.");
  return { errors, warnings };
}
