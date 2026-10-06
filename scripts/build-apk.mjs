#!/usr/bin/env node
// Builds the advisor Android app: a Trusted Web Activity (made with Bubblewrap) that opens the live advisor
// pages (/advisor) full screen in Chrome. Run it after the app is deployed and has its address:
//
//   npm run build:apk -- --host tba-drop-letter--your-project-id.us-east4.hosted.app
//
// Options:
//   --host <address>        the live app's address, without https:// (required)
//   --keystore <file>       the signing key; created on the first run if it does not exist
//                           (default: the folder "tba-drop-letter-signing" in your user folder)
//   --version-code <n>      Android version code; must go up with every update (default: from the date and time)
//   --version-name <text>   version shown to people (default: today's date, e.g. 2026.10.01)
//   --accept-android-sdk-terms
//                           on the first run, download Java 17 and the Android SDK without asking; this accepts
//                           the Android SDK terms (https://developer.android.com/studio/terms)
// The signing key password is asked for, or taken from the TBA_SIGNING_PASSWORD environment variable
// (needed when nobody can type it in, for example when another program runs the build).
//
// The first run downloads Java 17 and the Android SDK (several hundred MB) with Bubblewrap's own installers.
// Output: android/output/tba-drop-letter.apk (to share or install) and tba-drop-letter.aab (for Google Play).
// Works on Windows, macOS and Linux (Node.js 22 or 24).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = join(ROOT, "android", "twa-manifest.json");
const PROJECT = join(ROOT, "android", "build");
const OUTPUT = join(ROOT, "android", "output");
const PUBLIC = join(ROOT, "public");
const KEY_ALIAS = "tba-drop-letter";
const DEFAULT_KEYSTORE = join(homedir(), "tba-drop-letter-signing", "tba-drop-letter.keystore");
const BUBBLEWRAP_CONFIG = join(homedir(), ".bubblewrap", "config.json"); // where Bubblewrap keeps the Java and SDK folders
const PASSWORD_RULE = /^[A-Za-z0-9._-]{10,}$/; // Bubblewrap hands the password to the command shell
const WINDOWS = process.platform === "win32";
const INTERACTIVE = Boolean(process.stdin.isTTY);
process.noDeprecation = true; // Bubblewrap's libraries print warnings that mean nothing to the person building

function fail(message) {
  console.error(`\nCould not build the Android app: ${message}\n`);
  process.exit(1);
}

let args;
let positionals;
try {
  ({ values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      host: { type: "string" },
      keystore: { type: "string" },
      "version-code": { type: "string" },
      "version-name": { type: "string" },
      "accept-android-sdk-terms": { type: "boolean" },
      help: { type: "boolean" },
    },
  }));
} catch (e) {
  fail(`${e.message}\nSee: npm run build:apk -- --help`);
}
// Windows PowerShell with an older npm drops the "--" of `npm run build:apk -- --host ...`. npm then keeps the
// options itself, as npm_config_* variables (with their value only when written --name=value), and passes any
// other words on. So look there too, and take a lone extra word as the address.
for (const name of ["host", "keystore", "version-code", "version-name", "accept-android-sdk-terms"]) {
  const value = process.env[`npm_config_${name.replaceAll("-", "_")}`];
  if (args[name] !== undefined || !value) continue;
  if (name === "accept-android-sdk-terms") args[name] = value === "true";
  else if (value !== "true") args[name] = value;
}
if (!args.host && positionals.length === 1) args.host = positionals[0];
else if (positionals.length) fail(`unexpected "${positionals.join(" ")}". Write the options as --name=value, for example --host=drop.example.com`);
if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\nimport ")[0].replace(/^#!.*\n/, "").replace(/^\/\/ ?/gm, ""));
  process.exit(0);
}

// ---------- settings ----------

const host = (args.host ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
if (!host) fail("give the app's address, for example:\n  npm run build:apk -- --host tba-drop-letter--your-project-id.us-east4.hosted.app");
if (!/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) fail(`"${args.host}" is not a web address like drop.example.com.`);

const now = new Date();
const versionCode = args["version-code"] ? Number(args["version-code"]) : Math.floor((now.getTime() - Date.UTC(2024, 0, 1)) / 60000);
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) fail("--version-code must be a whole number from 1 to 2100000000.");
const pad = (n) => String(n).padStart(2, "0");
const versionName = args["version-name"]?.trim() || `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`;
const keystore = resolve(args.keystore ?? DEFAULT_KEYSTORE);

const require = createRequire(import.meta.url);
let bubblewrap;
try {
  bubblewrap = require.resolve("@bubblewrap/cli/bin/bubblewrap.js");
} catch {
  fail("Bubblewrap is not installed. Run npm install first.");
}
// Bubblewrap's own building blocks: its Java and Android SDK installers and its checks.
const fromBubblewrap = createRequire(bubblewrap);
const core = fromBubblewrap("@bubblewrap/core");
const { InquirerPrompt } = fromBubblewrap("../dist/lib/Prompt.js");
const { JdkInstaller } = fromBubblewrap("../dist/lib/JdkInstaller.js");
const { AndroidSdkToolsInstaller } = fromBubblewrap("../dist/lib/AndroidSdkToolsInstaller.js");

// ---------- helpers ----------

/** Runs the Bubblewrap command line in the Android project folder (not blocking, so the icon server can answer it). */
async function runBubblewrap(cmdArgs, env = {}) {
  const child = spawn(process.execPath, ["--no-deprecation", bubblewrap, ...cmdArgs], {
    cwd: PROJECT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  const code = await new Promise((done) => {
    child.on("error", () => done(-1));
    child.on("close", done);
  });
  if (code !== 0) fail(`"bubblewrap ${cmdArgs[0]}" stopped with an error (see the messages above).`);
}

function ask(question, hidden = false) {
  if (!INTERACTIVE) return Promise.resolve(null);
  return new Promise((done) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      done(answer.trim());
    });
    muted = hidden;
  });
}

let termsAccepted = Boolean(args["accept-android-sdk-terms"]);
/** The Android SDK may only be downloaded once its terms are accepted, here or with --accept-android-sdk-terms. */
async function acceptSdkTerms(what) {
  if (termsAccepted) return;
  console.log(`\n${what}\nThe Android SDK is provided by Google under these terms: https://developer.android.com/studio/terms`);
  const answer = await ask("Do you accept the Android SDK terms and want to download it now? (y/N) ");
  if (answer === null) fail("nobody can answer the question here. If you accept the Android SDK terms, run the same command again with --accept-android-sdk-terms at the end.");
  if (!/^y(es)?$/i.test(answer)) fail("the Android SDK terms were not accepted, so nothing was downloaded.");
  termsAccepted = true;
}

/** Bubblewrap cannot run Java or the SDK from a folder with a space in its name on Windows (C:\Users\Jane Doe\...). */
const usable = async (path, validate) =>
  Boolean(path) && !(WINDOWS && /\s/.test(path)) && existsSync(path) && (await validate(path)).isOk();

/** Java 17 and the Android SDK command-line tools: the ones set up before, or downloaded now. */
async function setUpTools() {
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(BUBBLEWRAP_CONFIG, "utf8"));
  } catch {
    // first run
  }
  let jdkPath = (await usable(saved.jdkPath, (p) => core.JdkHelper.validatePath(p))) ? saved.jdkPath : "";
  let sdkPath = (await usable(saved.androidSdkPath, (p) => core.AndroidSdkTools.validatePath(p))) ? saved.androidSdkPath : "";
  if (jdkPath && sdkPath) return new core.Config(jdkPath, sdkPath);

  const home = dirname(BUBBLEWRAP_CONFIG);
  const folder = WINDOWS && /\s/.test(home) ? join(process.env.SystemDrive || "C:", "\\", "bubblewrap") : home;
  await acceptSdkTerms(`First run: building needs Java 17 (Eclipse Temurin) and the Android SDK tools. They are downloaded once\n(several hundred MB) into ${folder}`);
  const progress = new InquirerPrompt(); // only its messages and download progress bar are used
  // Saved after each part, so a second run does not download again what already arrived.
  const save = () => new core.Config(jdkPath, sdkPath).saveConfig(BUBBLEWRAP_CONFIG);
  try {
    if (!jdkPath) {
      mkdirSync(join(folder, "jdk"), { recursive: true });
      const installer = new JdkInstaller(process, progress);
      // On Windows Bubblewrap picks the 32-bit Java, which often cannot give the Android build the 1.5 GB of memory
      // it asks for; 64-bit Windows gets the 64-bit Java of the same release instead.
      if (WINDOWS && process.arch !== "ia32") installer.downloadFile = installer.downloadFile.replace("_x86-32_", "_x64_");
      jdkPath = await installer.install(join(folder, "jdk"));
      await save();
    }
    if (!sdkPath) {
      const target = join(folder, "android_sdk");
      mkdirSync(target, { recursive: true });
      await new AndroidSdkToolsInstaller(process, progress).install(target);
      sdkPath = target;
      await save();
    }
  } catch (e) {
    fail(`the download did not finish (${e.message ?? e}). Check the internet connection and run the command again.`);
  }
  return new core.Config(jdkPath, sdkPath);
}

/** The Android build tools that Bubblewrap signs with; installed into the SDK once, after the licences are accepted. */
async function setUpBuildTools(config) {
  const sdk = new core.AndroidSdkTools(process, config, new core.JdkHelper(process, config));
  if (await sdk.checkBuildTools()) return;
  await acceptSdkTerms(`The Android build tools need to be downloaded into ${config.androidSdkPath}`);
  const sdkmanager = [join(config.androidSdkPath, "tools", "bin", "sdkmanager"), join(config.androidSdkPath, "bin", "sdkmanager")]
    .map((p) => (WINDOWS ? `${p}.bat` : p))
    .find((p) => existsSync(p));
  if (!sdkmanager) fail(`sdkmanager is missing from ${config.androidSdkPath}. Delete that folder and run the command again.`);
  console.log("Recording that the Android SDK licences are accepted...");
  const licences = spawnSync(`"${sdkmanager}"`, ["--licenses", `--sdk_root=${WINDOWS ? config.androidSdkPath : `"${config.androidSdkPath}"`}`], {
    shell: true, // sdkmanager is a .bat file on Windows
    input: "y\n".repeat(50), // the terms were accepted above: "yes" to each licence it shows
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: sdk.getEnv(),
  });
  if (licences.status !== 0) fail(`sdkmanager could not record the licences.\n${(licences.stdout + licences.stderr).slice(-2000)}`);
  try {
    await sdk.installBuildTools();
  } catch {
    fail("the Android build tools could not be downloaded (see the messages above). Check the internet connection and run the command again.");
  }
}

/** keytool from the Java that Bubblewrap uses. */
function keytool(config) {
  return join(core.JdkHelper.getJavaHome(config.jdkPath, process), "bin", WINDOWS ? "keytool.exe" : "keytool");
}

/** What keytool printed when it failed (it writes its errors to standard output). */
function keytoolSaid(e) {
  const lines = `${e.stdout ?? ""}\n${e.stderr ?? ""}`.split("\n").filter((l) => l.trim() && !l.startsWith("Picked up "));
  return lines.join("\n") || e.message;
}

function runKeytool(config, keyArgs, password) {
  return execFileSync(keytool(config), ["-J-Duser.language=en", ...keyArgs], {
    encoding: "utf8",
    env: { ...process.env, TBA_KEYSTORE_PASSWORD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Serves the app icons from public/ while Bubblewrap reads them, so the build does not depend on the live site. */
function serveIcons() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = join(PUBLIC, path);
    if (!/^\/icons\/[\w.-]+\.png$/.test(path) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png" }).end(readFileSync(file));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

// ---------- 1. Java and the Android SDK (first run only) ----------

console.log(`\nAndroid app for https://${host}/advisor (version ${versionName}, code ${versionCode})`);
const tools = await setUpTools();
await setUpBuildTools(tools);

// ---------- 2. the signing key ----------

let password = process.env.TBA_SIGNING_PASSWORD?.trim() ?? "";
if (!existsSync(keystore)) {
  console.log(`\nNo signing key yet. Creating one at:\n  ${keystore}`);
  console.log("Every update of the app must be signed with this same key: keep the file and its password safe");
  console.log("(see README, \"Android app for advisors\"). The password needs 10 or more letters, digits, dots, dashes");
  console.log("or underscores, for example three words joined with dashes.\n");
  if (!password) {
    password = await ask("New signing key password: ", true);
    if (password === null) fail("set the password in the TBA_SIGNING_PASSWORD environment variable first (nobody can type it in here).");
    if (PASSWORD_RULE.test(password) && (await ask("Type it again: ", true)) !== password) fail("the two passwords are different.");
  }
  if (!PASSWORD_RULE.test(password)) fail("the password needs 10 or more letters, digits, dots, dashes or underscores.");
  mkdirSync(dirname(keystore), { recursive: true });
  try {
    runKeytool(tools, [
      "-genkeypair", "-keystore", keystore, "-storetype", "PKCS12", "-alias", KEY_ALIAS,
      "-keyalg", "RSA", "-keysize", "2048", "-validity", "20000",
      "-dname", "CN=TBA Drop Letter, OU=Advisor app, O=TBA, C=IN",
      "-storepass:env", "TBA_KEYSTORE_PASSWORD", "-keypass:env", "TBA_KEYSTORE_PASSWORD",
    ], password);
  } catch (e) {
    fail(`keytool could not create the key.\n${keytoolSaid(e)}`);
  }
  console.log("Signing key created.");
} else if (!password) {
  password = await ask(`Password of the signing key ${keystore}: `, true);
  if (password === null) fail("set the signing key password in the TBA_SIGNING_PASSWORD environment variable first (nobody can type it in here).");
}

let sha256;
try {
  const info = runKeytool(tools, ["-list", "-v", "-keystore", keystore, "-alias", KEY_ALIAS, "-storepass:env", "TBA_KEYSTORE_PASSWORD"], password);
  sha256 = info.match(/SHA-?256:\s*([0-9A-F]{2}(?::[0-9A-F]{2}){31})/i)?.[1];
} catch (e) {
  const said = keytoolSaid(e);
  fail(/password|tampered/i.test(said) ? "wrong password for the signing key." : `could not read the signing key.\n${said}`);
}

// ---------- 3. the Android project ----------

mkdirSync(PROJECT, { recursive: true });
mkdirSync(OUTPUT, { recursive: true });
const twa = JSON.parse(readFileSync(CONFIG, "utf8"));
const icons = await serveIcons();
const local = `http://127.0.0.1:${icons.address().port}`;
const iconPath = (url) => new URL(url).pathname;
Object.assign(twa, {
  host,
  fullScopeUrl: `https://${host}/`,
  iconUrl: local + iconPath(twa.iconUrl),
  maskableIconUrl: twa.maskableIconUrl ? local + iconPath(twa.maskableIconUrl) : undefined,
  appVersionCode: versionCode,
  appVersion: versionName,
  signingKey: { path: keystore, alias: KEY_ALIAS },
});
const manifest = join(PROJECT, "twa-manifest.json");
writeFileSync(manifest, JSON.stringify(twa, null, 2));
try {
  await runBubblewrap(["update", "--skipVersionUpgrade", `--manifest=${manifest}`, `--directory=${PROJECT}`]);
} finally {
  icons.close();
}

// ---------- 4. build and sign ----------

const built = { apk: join(PROJECT, "app-release-signed.apk"), aab: join(PROJECT, "app-release-bundle.aab") };
for (const file of Object.values(built)) rmSync(file, { force: true });
await runBubblewrap(["build", `--manifest=${manifest}`, `--directory=${PROJECT}`], {
  BUBBLEWRAP_KEYSTORE_PASSWORD: password,
  BUBBLEWRAP_KEY_PASSWORD: password,
});
const apk = join(OUTPUT, "tba-drop-letter.apk");
const aab = join(OUTPUT, "tba-drop-letter.aab");
copyFileSync(built.apk, apk);
copyFileSync(built.aab, aab);

console.log(`
Done. Version ${versionName} (code ${versionCode}).
  Android app to share or install:  ${apk}
  App bundle for Google Play:        ${aab}

Signing key SHA-256 fingerprint:
  ${sha256 ?? "(not found: run keytool -list -v on the key)"}

So the app opens full screen without the browser bar, this fingerprint must be in apphosting.yaml
(ANDROID_CERT_SHA256), followed by a deploy: npx firebase deploy --only apphosting
Keep a backup of ${keystore} and its password.
`);
