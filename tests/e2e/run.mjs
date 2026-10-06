// End-to-end test of the main flows against the Firebase emulators (Auth, Firestore, Functions).
//   npm run test:e2e
// Needs Playwright with Chromium installed globally (npm i -g playwright && npx playwright install chromium).
// Runs inside `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST and GCLOUD_PROJECT.
import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const { chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`);
const XLSX = require("xlsx");

const PROJECT = process.env.GCLOUD_PROJECT || "demo-tba";
const PORT = Number(process.env.E2E_PORT || 3200);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = new URL("./output/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const appEnv = {
  ...process.env,
  NEXT_PUBLIC_USE_MOCK: "false",
  NEXT_PUBLIC_FIREBASE_USE_EMULATORS: "true",
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT,
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
  NEXT_DIST_DIR: ".next-e2e",
  NEXT_TELEMETRY_DISABLED: "1",
  // Android app (assetlinks.json): two made-up signing key fingerprints, written two different ways.
  ANDROID_CERT_SHA256: `SHA256: ${"ab".repeat(32)}, ${Array(32).fill("12").join(":")}`,
};

const results = [];
let page;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(`ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
    console.log(`ok   ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split("\n")[0]}`);
    console.log(`FAIL ${name}\n${e.stack}`);
    await page?.screenshot({ path: `${OUT}failed.png` }).catch(() => {});
    throw e;
  }
}

// ---------- setup: data, app build, app server ----------
execFileSync("node", ["--no-warnings", "scripts/seed-emulators.mjs"], { stdio: "inherit", env: process.env });
if (!process.env.E2E_SKIP_BUILD) {
  execFileSync("npx", ["next", "build"], { stdio: "inherit", env: appEnv });
  // Route types of this build; left in place they break the next `npm run build` once a page moves (tsconfig includes them).
  rmSync(".next-e2e/types", { recursive: true, force: true });
}
async function startServer() {
  const s = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env: appEnv, stdio: ["ignore", "pipe", "pipe"], detached: true });
  s.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${BASE}/login`)).ok) break; } catch { /* starting */ }
    if (i > 60) throw new Error("app did not start");
    await new Promise((r) => setTimeout(r, 500));
  }
  return s;
}
async function stopServer(s) {
  try { process.kill(-s.pid); } catch { /* already stopped */ }
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${BASE}/login`); } catch { return; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("app did not stop");
}
let server = await startServer();

initializeApp({ projectId: PROJECT });
const db = getFirestore();
const authAccounts = async () => {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, {
    method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}",
  });
  return (await r.json()).userInfo ?? [];
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page = await ctx.newPage();
const errors = [];
let offline = false; // while the test has cut the network, failed requests are expected and not reported
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (!["error", "warning"].includes(m.type())) return;
  if (offline && /ERR_INTERNET_DISCONNECTED|transport errored|Could not reach Cloud Firestore|"code":"unavailable"|Failed to fetch RSC payload/.test(m.text())) return;
  errors.push(`console.${m.type()}: ${m.text().slice(0, 300)}`);
});

/**
 * Google sign-in as `email`. With E2E_POPUP=1 it goes through the Auth emulator's Google pop-up; that page needs
 * apis.google.com, so by default the test hands the app the account directly (window.__E2E_GOOGLE_ACCOUNT, honoured
 * by emulator builds only) and clicks the same "Sign in with Google" button: same access check, claims and routing.
 */
async function signIn(email, name) {
  await page.goto(`${BASE}/login`);
  const button = page.getByRole("button", { name: "Sign in with Google" });
  await button.waitFor();
  if (!process.env.E2E_POPUP) {
    await page.evaluate((account) => { window.__E2E_GOOGLE_ACCOUNT = account; }, { email, name });
    await button.click();
    return;
  }
  const [popup] = await Promise.all([page.waitForEvent("popup"), button.click()]);
  await popup.waitForLoadState();
  const known = popup.getByText(email, { exact: true });
  if (await known.count()) await known.first().click();
  else {
    await popup.locator("#add-account-button").click();
    await popup.fill("#email-input", email);
    await popup.fill("#display-name-input", name);
    await popup.locator("#sign-in").click();
  }
  await popup.waitForEvent("close", { timeout: 15000 }).catch(() => {});
}
async function signOut() {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in with Google" }).waitFor();
}
const shot = (name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

let exitCode = 0;
try {
  await step("someone not on the list is refused and signed out", async () => {
    await signIn("visitor@example.com", "Visitor");
    await page.getByRole("heading", { name: "You don't have access to TBA Drop Letter" }).waitFor();
    assert.match(await page.locator("main").textContent(), /visitor@example\.com is not on the access list/);
    await shot("01-not-authorised");
    const accounts = await authAccounts();
    assert.equal(accounts.filter((a) => a.email === "visitor@example.com").length, 0, "the Auth account the sign-in created is removed");
    await page.goto(`${BASE}/advisor`);
    await page.waitForURL(/\/login$/);
  });

  await step("advisor signs in, adds a drop and logs a response", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn("riya.shah@example.com", "Riya Shah");
    await page.waitForURL(/\/advisor$/);
    await page.getByText("My drops").waitFor();
    await page.locator("text=/\\d+ \\/ 200 letters/").waitFor();
    await page.getByRole("link", { name: "New drop" }).last().click();
    await page.fill("#office_number", "1204"); await page.fill("#company_name", "E2E Test Co");
    await page.fill("#building_name", "Shivalik Shilp"); await page.fill("#block_no", "B"); await page.fill("#city", "Ahmedabad");
    await page.getByRole("button", { name: "Save drop" }).click();
    await page.getByText("Saved.").waitFor();
    assert.match(await page.locator("main li a").first().textContent(), /E2E Test Co/);
    const saved = await db.collection("drops").where("company_name", "==", "E2E Test Co").get();
    assert.equal(saved.size, 1);
    assert.equal(saved.docs[0].get("advisor_id"), "u-adv1");
    assert.ok(saved.docs[0].get("search_tokens").includes("1204"));

    await page.getByRole("link", { name: "Log response" }).click();
    await page.fill("#response-search", "1204 e2e");
    await page.getByText("1 matching letter").waitFor();
    await page.locator("main li a").first().click();
    await page.getByLabel("Yes", { exact: true }).check();
    await page.getByRole("button", { name: "Save response" }).click();
    await page.locator("#response-error").waitFor();
    await page.fill("#response_phone", "+91 98765 43210");
    await page.getByRole("button", { name: "Save response" }).click();
    await page.getByText("Response saved.").waitFor();
    assert.ok(/bg-green-50/.test(await page.locator("main li a").first().getAttribute("class")));
    const after = (await db.doc(`drops/${saved.docs[0].id}`).get()).data();
    assert.equal(after.responded, true);
    assert.equal(after.response_phone, "+91 98765 43210");
    await shot("02-advisor-response");
  });

  await step("advisor saves a drop without signal; it syncs when back online", async () => {
    await page.getByRole("link", { name: "New drop" }).last().click();
    await page.getByRole("button", { name: "Save drop" }).waitFor();
    offline = true;
    await ctx.setOffline(true);
    await page.fill("#office_number", "707"); await page.fill("#company_name", "Offline Traders");
    await page.fill("#building_name", "Westgate"); await page.fill("#block_no", "C");
    await page.getByRole("button", { name: "Save drop" }).click();
    await page.getByText(/on this phone\. It will sync when you are back online/).waitFor();
    await page.getByText(/^Offline\./).waitFor();
    await shot("03-offline-saved");
    assert.equal((await db.collection("drops").where("company_name", "==", "Offline Traders").get()).size, 0, "not on the server yet");
    await ctx.setOffline(false);
    for (let i = 0; ; i++) {
      if ((await db.collection("drops").where("company_name", "==", "Offline Traders").get()).size === 1) break;
      if (i > 60) throw new Error("the offline entry did not sync");
      await new Promise((r) => setTimeout(r, 500));
    }
    offline = false;
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByText("My drops").waitFor();
  });

  await step("the advisor app opens without signal from its offline copy (service worker)", async () => {
    // Registered when the advisor screens first appeared. (This page started at /login, outside the worker's scope,
    // so the worker does not control it, and navigator.serviceWorker.ready would not resolve here.)
    const registration = () => page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration("/advisor");
      return r?.active ? r.scope : null;
    });
    for (let i = 0; !(await registration()); i++) {
      if (i > 40) throw new Error("the advisor service worker did not install");
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(await registration(), `${BASE}/advisor`);
    assert.ok((await page.evaluate(() => caches.keys())).some((k) => k.startsWith("tba-advisor-")), "offline copy stored");
    // No signal: the page is offline, and the app server is stopped too, because Playwright's offline mode does
    // not cover the service worker's own requests.
    offline = true;
    await ctx.setOffline(true);
    await stopServer(server);
    // Cold start, as when the app is opened with no signal.
    const res = await page.goto(`${BASE}/advisor`);
    assert.ok(res.fromServiceWorker());
    const worker = ctx.serviceWorkers().find((w) => w.url().includes("/advisor-sw.js"));
    assert.equal(await worker.evaluate(() => fetch("/login").then(() => "online", () => "offline")), "offline", "the worker could not reach the app");
    await page.getByText("Totals and weekly progress need an internet connection").waitFor();
    await page.getByText("Offline Traders").first().waitFor();
    await shot("04-offline-start");
    // Any drop opens from the same stored page (/advisor/drop?id=...), and so does New drop.
    await page.locator("main li a", { hasText: "Offline Traders" }).first().click();
    await page.getByRole("button", { name: "Save response" }).waitFor();
    assert.match(page.url(), /\/advisor\/drop\?id=/);
    await page.getByRole("link", { name: "New drop" }).last().click();
    await page.getByRole("button", { name: "Save drop" }).waitFor();
    server = await startServer();
    await ctx.setOffline(false);
    offline = false;
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByText("My drops").waitFor();
    await signOut();
  });

  await step("operations: dashboard, search, export, add an advisor, deactivate one, edit a target", async () => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn("ops@example.com", "Ops Admin");
    await page.waitForURL(/\/ops$/);
    await page.getByText("Month-wise analytics").waitFor();
    assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/ops"))?.scope ?? null), null,
      "the advisor offline copy never serves the operations pages");
    const total = (await db.collection("drops").count().get()).data().count;
    await page.getByText(total.toLocaleString("en-IN"), { exact: true }).first().waitFor();
    await shot("05-ops-dashboard");

    await page.getByRole("link", { name: "All drops" }).click();
    await page.getByText(`${total.toLocaleString("en-IN")} letters`).waitFor();
    await page.fill("#ops-search", "vasant");
    await page.getByText(/^1 letter · 0 responses/).waitFor();
    await page.fill("#ops-search", "301 vasant");
    await page.getByText("1 letter shown (totals need a single search word)").waitFor();
    await page.fill("#ops-search", "shivalik");
    await page.locator("select").nth(0).selectOption({ label: "ADV001 · Riya Shah" });
    const from = await db.collection("drops").where("advisor_id", "==", "u-adv1").orderBy("drop_date").limit(1).get();
    await page.locator("input[type=date]").nth(0).fill(from.docs[0].get("drop_date"));
    await page.locator("input[type=date]").nth(1).fill(today());
    const expected = (await db.collection("drops").where("advisor_id", "==", "u-adv1").where("search_tokens", "array-contains", "shivalik").get()).size;
    await page.getByText(new RegExp(`^${expected} letters · `)).waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export to Excel" }).click()]);
    const file = `${OUT}export.xlsx`;
    await download.saveAs(file);
    const rows = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets.Drops);
    assert.equal(rows.length, expected);
    assert.ok(rows.every((r) => r["Advisor ID"] === "ADV001" && /shivalik/i.test(r.Building)));
    assert.ok("Response phone" in rows[0] && "Response email" in rows[0]);
    await shot("06-ops-search-export");

    await page.getByRole("link", { name: "Advisors" }).click();
    await page.fill("input[name=full_name]", "Asha Patel"); await page.fill("input[name=advisor_code]", "adv004");
    await page.fill("input[name=region]", "Rajkot"); await page.fill("input[name=email]", "asha.patel@example.com");
    await page.getByRole("button", { name: "Add advisor" }).click();
    await page.getByText("Advisor ADV004 added").waitFor();
    await page.locator("tr", { hasText: "Neha Desai" }).getByRole("button", { name: "Deactivate" }).click();
    await page.locator("tr", { hasText: "Neha Desai" }).getByText("Deactivated").waitFor();
    assert.equal((await db.doc("users/u-adv3").get()).get("active"), false);

    await page.getByRole("link", { name: "Target levels" }).click();
    const card = page.locator("div", { has: page.getByText("Level 1", { exact: true }) }).filter({ has: page.locator("input[type=number]") }).last();
    await card.locator("input[type=number]").fill("210");
    await card.getByRole("button", { name: "Save" }).click();
    await card.getByText("Saved.").waitFor();
    assert.equal((await db.doc("levels/1").get()).get("target_letters"), 210);
    await signOut();
  });

  await step("master adds an operations user, who can then sign in", async () => {
    await signIn("master@example.com", "Master Admin");
    await page.waitForURL(/\/ops$/);
    await page.getByRole("link", { name: "Operations accounts" }).click();
    await page.fill("input[name=full_name]", "Dev Shah"); await page.fill("input[name=email]", "dev.shah@example.com");
    await page.getByRole("button", { name: "Add account" }).click();
    await page.getByText("Dev Shah added to operations").waitFor();
    await shot("07-master");
    await signOut();
    await signIn("dev.shah@example.com", "Dev Shah");
    await page.waitForURL(/\/ops$/);
    await page.getByText("Operations · Dev Shah").waitFor();
    await page.goto(`${BASE}/master`);
    await page.waitForURL(/\/ops$/, { timeout: 10000 });
    await signOut();
  });

  await step("the new advisor signs in; the deactivated one is refused", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn("asha.patel@example.com", "Asha Patel");
    await page.waitForURL(/\/advisor$/);
    await page.getByText("Asha Patel · ADV004").waitFor();
    await signOut();
    await signIn("neha.desai@example.com", "Neha Desai");
    await page.getByRole("heading", { name: "Your access has been turned off" }).waitFor();
    await shot("08-deactivated");
  });

  await step("the weekly level job runs in the Functions emulator, and a second run changes nothing", async () => {
    // The Functions emulator serves a scheduled function as an HTTP trigger with this id.
    const url = `http://127.0.0.1:5001/${PROJECT}/asia-south1/weeklyLevels-0`;
    const sunday = new Date();
    sunday.setDate(sunday.getDate() - sunday.getDay()); // back to the most recent Sunday (0 = Sunday)
    const at = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}T12:00:00+05:30`;
    const run = () => fetch(url, { method: "POST", headers: { "X-CloudScheduler-ScheduleTime": at } });
    const snapshot = async () => {
      const out = {};
      for (const c of ["users", "level_history", "weekly_results"]) {
        for (const d of (await db.collection(c).get()).docs) out[`${c}/${d.id}`] = d.updateTime.toMillis();
      }
      return out;
    };
    assert.equal((await run()).status, 200);
    const first = await snapshot();
    const written = Object.keys(first).filter((k) => k.startsWith("weekly_results/"));
    assert.ok(written.length >= 3, `weekly results written (${written.length})`);
    assert.equal((await run()).status, 200);
    assert.deepEqual(await snapshot(), first);
  });

  await step("Android app: asset links, web app manifest and icons", async () => {
    const links = await (await fetch(`${BASE}/.well-known/assetlinks.json`)).json();
    assert.deepEqual(links, [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.tba.dropletter",
        sha256_cert_fingerprints: [Array(32).fill("AB").join(":"), Array(32).fill("12").join(":")],
      },
    }]);
    const manifest = await (await fetch(`${BASE}/advisor.webmanifest`)).json();
    assert.equal(manifest.start_url, "/advisor");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.theme_color && manifest.background_color);
    for (const purpose of ["any", "maskable"]) {
      const icon = manifest.icons.find((i) => i.sizes === "512x512" && i.purpose === purpose);
      assert.ok(icon, `512px ${purpose} icon`);
      const r = await fetch(`${BASE}${icon.src}`);
      assert.equal(r.headers.get("content-type"), "image/png");
    }
  });
} catch {
  exitCode = 1;
} finally {
  await browser.close();
  try { process.kill(-server.pid); } catch { /* already stopped */ }
  console.log(`\n${results.join("\n")}`);
  if (errors.length) console.log(`\nPage errors:\n${errors.join("\n")}`);
  process.exit(exitCode);
}
