#!/usr/bin/env node
// Netlify build of the live app (netlify.toml). Checks the site's environment variables first, then runs
// `next build`; Netlify's Next.js runtime then serves the pages and runs the server actions as functions.
// A production deploy stops here, with a clear message, if the Firebase settings or the server credentials are
// missing, instead of publishing an app where nobody can sign in. Deploy previews only warn.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { checkLiveEnv } from "./live-env.mjs";

const production = process.env.CONTEXT === "production";
const { errors, warnings } = checkLiveEnv(process.env);
for (const w of warnings) console.warn(`[go-live] note: ${w}`);
for (const e of errors) console.error(`[go-live] ${production ? "STOP" : "warning"}: ${e}`);
if (errors.length && production) {
  console.error("\n[go-live] Fix the environment variables in Netlify (Project configuration > Environment variables; README, go-live step 7) and deploy again.\n");
  process.exit(1);
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const result = spawnSync(process.execPath, [next, "build"], { stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_USE_MOCK: "false" } });
process.exit(result.status ?? 1);
