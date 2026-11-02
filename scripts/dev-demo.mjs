#!/usr/bin/env node
// Runs the app locally with the in-browser demo data and demo accounts (no Firebase): `npm run dev:demo`.
// Works the same on Windows, Mac and Linux. Demo mode is for local development only; `next build` refuses it.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_USE_MOCK: "true" },
});
child.on("exit", (code) => process.exit(code ?? 0));
