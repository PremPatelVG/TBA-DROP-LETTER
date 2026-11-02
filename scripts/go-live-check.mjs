#!/usr/bin/env node
// Pre-flight check before deploying the live app: `npm run go-live:check` (add `-- --build` after `npm run build`
// to also scan the built app for demo data, `-- --env` to check environment variables). It only reads files; it changes nothing and needs no network.
//
// Checks: the Firebase project is set in .firebaserc (rules, indexes and the weekly function deploy there);
// netlify.toml builds the live app, not the demo; no service-account key or .env file is tracked by git; with
// --env, the environment variables (see scripts/live-env.mjs); with --build, that the built app has no demo accounts.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { checkLiveEnv } from "./live-env.mjs";

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

// ---- netlify.toml (the live app) ------------------------------------------------------------------
const toml = existsSync("netlify.toml") ? readFileSync("netlify.toml", "utf8") : "";
if (!/command\s*=\s*"npm run build:netlify"/.test(toml)) {
  problems.push('netlify.toml does not build the live app (expected command = "npm run build:netlify"). The demo is deployed separately.');
} else if (/NEXT_PUBLIC_USE_MOCK\s*=\s*"true"/.test(toml) || /NETLIFY_NEXT_PLUGIN_SKIP/.test(toml)) {
  problems.push("netlify.toml turns on demo data or turns off the Next.js runtime: the live app needs neither.");
} else ok.push("Netlify: builds the live app (Next.js runtime), never the demo data");

// ---- Netlify environment variables ---------------------------------------------------------------
// They live in the Netlify UI, so they are checked on every Netlify build (scripts/netlify-build.mjs). Run
// `npx netlify env:list` to see them, or pass --env to check the variables of this terminal / .env.production.
if (process.argv.includes("--env")) {
  const env = { ...process.env };
  if (existsSync(".env.production")) {
    for (const line of readFileSync(".env.production", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  const { errors, warnings } = checkLiveEnv(env);
  for (const e of errors) problems.push(e);
  for (const w of warnings) todo.push(w);
  if (!errors.length) ok.push("Environment variables: Firebase settings and server credentials present");
} else {
  todo.push("Netlify environment variables (NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, SMTP_*, APP_URL): set in the Netlify UI, README go-live step 7. Every production build checks them and stops if the Firebase ones are missing.");
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
