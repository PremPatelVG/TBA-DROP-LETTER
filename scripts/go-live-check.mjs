#!/usr/bin/env node
// Pre-flight check before deploying the live app: `npm run go-live:check` (add `-- --build` after `npm run build`
// to also scan the built app for demo data). It only reads files; it changes nothing and needs no network.
//
// Checks: the Firebase project is set in .firebaserc; apphosting.yaml uses Firebase (not demo data), has a real
// APP_URL and sign-in domain, and takes the SMTP password from Secret Manager (never written in the file); no
// service-account key or .env file is tracked by git; and, with --build, that the built app has no demo accounts.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const problems = [];
const todo = [];
const ok = [];

// ---- Firebase project ----------------------------------------------------------------------------
let projectId;
try {
  projectId = JSON.parse(readFileSync(".firebaserc", "utf8")).projects?.default;
} catch {
  /* reported below */
}
if (!projectId || projectId === "your-firebase-project-id") {
  todo.push("Firebase project: run `npx firebase use --add` and pick the live project (README, go-live step 6).");
} else ok.push(`Firebase project: ${projectId}`);

// ---- apphosting.yaml -----------------------------------------------------------------------------
const yaml = readFileSync("apphosting.yaml", "utf8");
/** The value of an active (uncommented) env entry, or undefined. Tiny parser for this file's own layout. */
function envEntry(name) {
  const lines = yaml.split(/\r?\n/);
  const i = lines.findIndex((l) => new RegExp(`^\\s*-\\s*variable:\\s*${name}\\s*$`).test(l));
  if (i < 0) return undefined;
  const entry = {};
  for (const l of lines.slice(i + 1, i + 4)) {
    const m = l.match(/^\s+(value|secret):\s*"?([^"#]*?)"?\s*(#.*)?$/);
    if (m) entry[m[1]] = m[2].trim();
    if (/^\s*-\s*variable:/.test(l)) break;
  }
  return entry;
}

const mock = envEntry("NEXT_PUBLIC_USE_MOCK");
if (mock?.value === "true") problems.push('apphosting.yaml sets NEXT_PUBLIC_USE_MOCK to "true": the live app must use Firebase. Set it to "false".');
else ok.push("Data: Firebase (no demo data or demo accounts in the live app)");

const appUrl = envEntry("APP_URL")?.value;
if (!appUrl || !/^https:\/\/[^\s/]+/.test(appUrl)) {
  todo.push("APP_URL in apphosting.yaml: set the app's live https:// address (welcome emails link to it).");
} else if (/app\.tbaindia\.in|example|REPLACE/i.test(appUrl)) {
  todo.push(`APP_URL in apphosting.yaml is still the placeholder (${appUrl}). Set the real live address, or confirm app.tbaindia.in is pointed at App Hosting.`);
} else ok.push(`APP_URL: ${appUrl}`);

const authDomain = envEntry("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN")?.value;
if (!authDomain || authDomain === "your-app-domain.example") {
  todo.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN in apphosting.yaml: uncomment it and set the app's own address, after the first deploy (README, go-live step 9). Needed for sign-in in the home-screen app.");
} else ok.push(`Sign-in domain: ${authDomain}`);

const pass = envEntry("SMTP_PASS");
if (pass?.value) problems.push("apphosting.yaml has SMTP_PASS written as a value. Remove it at once, change that App Password, and use `secret: SMTP_PASS`.");
else if (pass?.secret !== "SMTP_PASS") todo.push("SMTP_PASS in apphosting.yaml is not set up: welcome emails will be skipped (README, go-live step 6b).");
else {
  const user = envEntry("SMTP_USER")?.value;
  const host = envEntry("SMTP_HOST")?.value;
  ok.push(`Email: ${user ?? "?"} via ${host ?? "?"}; password from the Secret Manager secret SMTP_PASS`);
  todo.push("Make sure the SMTP_PASS secret exists BEFORE the first deploy: `npx firebase apphosting:secrets:set SMTP_PASS` (the deploy fails without it).");
}

// ---- Secrets in git ------------------------------------------------------------------------------
try {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n");
  const bad = tracked.filter((f) => /(^|\/)(service-account[^/]*\.json|\.env(\.local|\.production)?)$/.test(f));
  if (bad.length) problems.push(`Secret files are tracked by git: ${bad.join(", ")}. Remove them from git and rotate the keys.`);
  else ok.push("No key files or .env files in git");
} catch {
  /* not a git checkout (e.g. a ZIP download): nothing to check */
}
if (existsSync("service-account.json")) todo.push("Delete service-account.json from this folder once create-master has run.");

// ---- Built app (optional) ------------------------------------------------------------------------
if (process.argv.includes("--build")) {
  const dir = process.env.NEXT_DIST_DIR || ".next";
  if (!existsSync(join(dir, "static"))) problems.push(`No build found in ${dir}/static: run \`npm run build\` first.`);
  else {
    const markers = ["demo1234", "riya.shah@example.com", "master@example.com", "Reset demo data"];
    const hits = new Set();
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|html|json)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          for (const m of markers) if (text.includes(m)) hits.add(`${m} in ${p}`);
        }
      }
    };
    walk(join(dir, "static"));
    if (existsSync(join(dir, "server"))) walk(join(dir, "server"));
    if (hits.size) problems.push(`The build contains demo data:\n     ${[...hits].join("\n     ")}`);
    else ok.push("Build: no demo accounts or demo data found");
  }
}

// ---- Report --------------------------------------------------------------------------------------
console.log("\nTBA Drop Letter: go-live check\n");
for (const l of ok) console.log(`  OK    ${l}`);
for (const l of todo) console.log(`  TODO  ${l}`);
for (const l of problems) console.log(`  STOP  ${l}`);
console.log(problems.length ? "\nFix the STOP items before deploying.\n" : todo.length ? "\nNo blockers; finish the TODO items.\n" : "\nReady to deploy.\n");
process.exit(problems.length ? 1 : 0);
