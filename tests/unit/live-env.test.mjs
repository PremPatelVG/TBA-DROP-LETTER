import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLiveEnv } from "../../scripts/live-env.mjs";

const full = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "k",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "app.tbaindia.in",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "tba-live",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
  FIREBASE_CLIENT_EMAIL: "svc@tba-live.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
  SMTP_HOST: "smtp.gmail.com",
  SMTP_USER: "indiaops@tbaindia.in",
  SMTP_PASS: "x",
  APP_URL: "https://app.tbaindia.in",
};

test("a complete live environment passes", () => {
  assert.deepEqual(checkLiveEnv(full), { errors: [], warnings: [] });
});

test("demo mode is refused", () => {
  assert.equal(checkLiveEnv({ ...full, NEXT_PUBLIC_USE_MOCK: "true" }).errors.length, 1);
});

test("missing Firebase settings or server credentials are errors", () => {
  assert.match(checkLiveEnv({ ...full, NEXT_PUBLIC_FIREBASE_API_KEY: "" }).errors[0], /NEXT_PUBLIC_FIREBASE_API_KEY/);
  assert.match(checkLiveEnv({ ...full, FIREBASE_PRIVATE_KEY: undefined }).errors[0], /FIREBASE_CLIENT_EMAIL/);
  assert.match(checkLiveEnv({ ...full, FIREBASE_PRIVATE_KEY: "not a key" }).errors[0], /BEGIN PRIVATE KEY/);
  const whole = { ...full, FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", FIREBASE_SERVICE_ACCOUNT_KEY: "{}" };
  assert.deepEqual(checkLiveEnv(whole).errors, []);
});

test("email settings only warn; a bad APP_URL is an error", () => {
  const r = checkLiveEnv({ ...full, SMTP_PASS: "" });
  assert.deepEqual(r.errors, []);
  assert.match(r.warnings[0], /SMTP_PASS/);
  assert.equal(checkLiveEnv({ ...full, APP_URL: "app.tbaindia.in" }).errors.length, 1);
});

test("auth domain: no scheme; firebaseapp.com only warns", () => {
  assert.equal(checkLiveEnv({ ...full, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "https://app.tbaindia.in" }).errors.length, 1);
  assert.equal(checkLiveEnv({ ...full, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "tba-live.firebaseapp.com" }).warnings.length, 1);
});
