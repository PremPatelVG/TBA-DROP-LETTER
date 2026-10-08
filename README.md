# TBA Drop Letter

App for tracking letter drops. Field advisors log each drop in an Android app (or the same pages in a phone
browser); the operations team (desktop web) manages advisors, searches all drops, exports them and sees the analytics.

Stack: Next.js 15 (App Router, TypeScript), Tailwind CSS 4, Firebase (Google and email/password sign-in,
Firestore, a scheduled Cloud Function), hosted on Firebase App Hosting by default. The Android app is a Trusted
Web Activity made with Bubblewrap: it opens the live advisor pages full screen in Chrome.

- [Quick start (demo mode)](#quick-start-demo-mode-no-backend)
- [Go live: step by step](#go-live-step-by-step) (for a non-developer)
- [Android app for advisors](#android-app-for-advisors) (building, signing and sharing the APK)
- [How it works on Firebase](#how-it-works-on-firebase) (for developers)
- [Local development with the emulators](#local-development-with-the-emulators) and [tests](#tests)
- [Demo site on Netlify](#demo-site-on-netlify) (the clickable demo with sample data, for review)

## Quick start (demo mode, no backend)
```
npm install
npm run dev      # http://localhost:3000
```
Demo mode is on by default (`NEXT_PUBLIC_USE_MOCK` unset or `true`). You can sign in with an email and the shared
demo password (shown on the sign-in screen, `demo1234`), or "Sign in with Google" opens a demo account chooser:
**Master Admin** (everything operations sees, plus managing operations accounts), **Ops Admin** for the operations
screens, an advisor (ADV001-ADV003), or **Visitor**, who is not on the access list and is refused.
Sample data (3 advisors, about 2,700 letters: a small pilot from April, then a ramp-up over the last two months,
so this week's progress shows roughly 60-180 letters) is stored in the browser's localStorage; "Reset demo data"
on the login screen restores it.

## Roles
- `advisor`: field staff; mobile app under `/advisor`.
- `operations`: web admin under `/ops`; adds and deactivates advisors, edits targets.
- `master`: everything operations can do, plus `/master` to add, deactivate and reactivate operations accounts.
  Only master can manage operations accounts.

Everyone signs in with an email and password or with Google (same email either way). Only people added in advance
can use the app: master adds operations, operations (or master) add advisors, each with their email and an initial
password. Anyone else who signs in sees "You don't have access" and is signed out; a deactivated person sees "Your
access has been turned off".

## Screens
Advisor (mobile screens with bottom navigation; the Android app opens them full screen, and they also work in a
phone browser or installed from it via `public/advisor.webmanifest`):
- `/advisor` dashboard: letters dropped, buildings covered, responses, response rate, this week's belt and how many
  more entries reach the next belt, the belt leaderboard, and my drops (responded drops are green).
- `/advisor/drops/new` add a drop, one entry per letter: office number*, company name*, building name*, block no.*,
  area, city, full address, date of drop (defaults to today); * = required. "Save and add another" keeps the
  building details. Works without signal: the entry is kept on the phone and syncs when the connection is back.
- `/advisor/responses` Log response: one search box over office number, company name and building name (every word
  must match the start of a word, e.g. "305 shivalik"), plus a date-of-drop filter; advisors only see their own
  letters. Tapping a result opens `/advisor/drop?id=<id>` to log the response: yes/no, call/email, date, notes, and
  the phone number and/or email of the person who responded. With "Yes" at least one of the two is required
  (phone: 10 digits, optional +91, spaces or dashes allowed; email: name@domain); with "No" both are hidden.
- `/advisor/leads` direct leads.

Operations and master (desktop web admin):
- `/ops` consolidated totals, month-wise chart (last 6 months), one row per advisor, and the belt leaderboard.
- `/ops/drops` all drops with filters (advisor, date range, city, building), multi-word search over office number,
  company name and building name, responder phone and email columns, and Excel export of the filtered rows
  (SheetJS, in the browser).
- `/ops/advisors` add advisors (name, advisor ID, region, Google email), deactivate or reactivate them.
- `/master` (master only) operations accounts.

Ranking: advisors are ranked only by the **belt** system, from their entry count in the current competition week —
Red (fewer than 200), Yellow (200-349), Blue (350-500), Green (501 or more). These thresholds are fixed; there is
no level system. The leaderboard refreshes every Monday morning when the previous week's standings are recorded.

Definitions: one drop entry is one letter, so letters dropped, this week's belt, analytics, the per-advisor
tables and the export all count entries. Buildings covered = distinct building names. Response rate = responded
letters / letters. The competition week runs Monday 09:00 to the following Monday 09:00, India time.

---

## Go live: step by step

This takes about an hour the first time. You need a Google account, a payment card (for the Blaze plan; a small
team normally costs little, but set the budget alert in step 2), and a Windows or Mac computer.
Commands are typed in a terminal window opened in the project folder:
- **Windows**: open the project folder in File Explorer, click the address bar, type `cmd` and press Enter.
- **Mac**: open Terminal, type `cd ` (with a space), drag the project folder into the window, press Enter.

### 1. Create the Firebase project
1. Go to https://console.firebase.google.com and sign in with the Google account that will own the app
   (a company account is best).
2. Click **Create a project** (or **Add project**), name it, for example `TBA Drop Letter`.
3. Under the name, Firebase shows the **project ID** (for example `tba-drop-letter-1a2b3`). Write it down.
4. Google Analytics is not needed; you can turn it off. Click **Create project**.

### 2. Upgrade to the Blaze plan and set a budget alert
The weekly belt snapshot (a scheduled Cloud Function) and App Hosting need the pay-as-you-go **Blaze** plan.
1. In the Firebase console, click **Upgrade** next to "Spark plan" (bottom left, or under the gear icon >
   **Usage and billing**), choose **Blaze**, and create or pick a Cloud Billing account with your card.
2. Set a budget alert, so you get an email if costs go above what you expect. If the upgrade screen offers a
   budget, set it there. Otherwise open https://console.cloud.google.com/billing, choose your billing account >
   **Budgets & alerts** > **Create budget**: scope = this project, amount = for example ₹1,000 a month, keep the
   alerts at 50%, 90% and 100%, **Finish**. A budget alert sends emails; it does not stop the app.

### 3. Create the Firestore database
1. In the Firebase console, open **Firestore Database** (left menu; use the search box if you don't see it).
2. Click **Create database**. If asked for an edition, choose **Standard**. Keep the database ID `(default)`.
3. Location: **asia-south1 (Mumbai)** for a team in India. It cannot be changed later.
4. Choose **Start in production mode** and click **Create**. (The real security rules are uploaded in step 7.)

### 4. Turn on sign-in (Google and Email/Password)
People can sign in either with Google or with an email and password; the email is the same identity for both.
1. Open **Authentication** > **Get started** > **Sign-in method** tab.
2. Click **Google**, switch **Enable** on, pick your email as the "support email", click **Save**.
3. Click **Add new provider** > **Email/Password**, switch the first **Enable** on (leave "Email link" off),
   click **Save**.
4. Leave **Settings** > **User account linking** on its default, **Link accounts that use the same email** (so a
   person who uses both Google and a password keeps one account). Leave every other sign-in method off.

### 5. Install Node.js and get the project files
1. Install **Node.js** version 24 (LTS) or 22 from https://nodejs.org. Check it in a new terminal:
   `node --version` should print v24 or v22. (A newer version usually works but shows warnings.)
2. Put the project folder on your computer (for example, on GitHub: **Code** > **Download ZIP**, then unzip).
3. Open a terminal in that folder (see the top of this guide) and run:
   ```
   npm install
   ```
   It downloads what the app needs; it takes a few minutes and warnings are normal.

### 6. Connect this folder to your Firebase project
```
npx firebase login
```
A browser window opens: sign in with the same Google account as in step 1 and allow access. Then:
```
npx firebase use --add
```
Pick your project with the arrow keys and Enter, and when asked for an alias type `default` and press Enter.
(This saves the project ID in the file `.firebaserc`; you can also edit that file and replace
`your-firebase-project-id` with your project ID.)

### 7. Deploy
```
npx firebase deploy
```
This uploads the security rules and search indexes, the weekly belt snapshot, and the app itself. The first time
it asks a few questions:
- "Did not find backend(s) tba-drop-letter. Do you want to create them?" press Enter (yes).
- "Which backends do you want to create and deploy to?" press Space to tick `tba-drop-letter`, then Enter.
- "Select a primary region to host your backend": pick the one nearest your team with the arrow keys, then Enter.
- "How many days do you want to keep container images before they're deleted?" press Enter.

It takes 10-15 minutes. At the end it prints the app's address, like
`https://tba-drop-letter--your-project-id.<region>.hosted.app` (also shown in the Firebase console under
**App Hosting**). If it stops because a Google service was "just enabled", wait two minutes and run the same
command again. The search indexes finish building a few minutes after the deploy; until then a search can show an
error mentioning an index.

### 8. Create the master account
Use the Google account (Gmail or company Google Workspace) of the person who will be master:
```
npm run create-master -- --email you@yourcompany.in --name "Your Name"
```
It creates the master entry and uses the login from step 6.
It is safe to run again, for example to fix the name or to restore master access.

To let the master sign in with an email and password as well as Google, add a password (at least 8 characters):
```
npm run create-master -- --email you@yourcompany.in --name "Your Name" --password "a-strong-password"
```
The password is set on the master's sign-in account only; it is never stored in the database. (Everyone else gets
their initial password when you add them in step 10.)

If it says it has **no access**: run `npx firebase login --reauth` and try again. If it still fails, use a key
file: Firebase console > gear icon > **Project settings** > **Service accounts** > **Generate new private key**,
save the file in the project folder as `service-account.json`, run the command again, then **delete the file**
(it gives full access to your data; it is never uploaded or committed, but don't keep it lying around).

### 9. Make sign-in work on phones and in the Android app
On computers and in phone browsers, sign-in opens a Google pop-up and works as soon as the app is deployed. The
Android app, the app added to the home screen (especially on iPhone), and phones that block the pop-up sign in by
going to Google's page and coming back instead, which only works when sign-in runs on the app's own address. Set
that up once:
1. **Your app's address** without `https://`, for example `tba-drop-letter--your-project-id.<region>.hosted.app`
   (from step 7), or your own domain if you connect one later (App Hosting > Settings > Domains).
2. Firebase console > **Authentication** > **Settings** > **Authorized domains**: if the address is not listed,
   click **Add domain** and add it.
3. Open https://console.cloud.google.com/apis/credentials (check the project name at the top). Under
   **OAuth 2.0 Client IDs**, open **Web client (auto created by Google Service)**. Under **Authorized redirect
   URIs** click **Add URI**, enter `https://<your app's address>/__/auth/handler`, and click **Save**.
4. Open `apphosting.yaml` in the project folder (Notepad or TextEdit). Near the end, delete the `# ` (hash and
   space) at the start of the three lines of `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, and replace
   `your-app-domain.example` with your app's address. Save.
5. Deploy the app again: `npx firebase deploy --only apphosting`.

If you later add your own domain, repeat 2-5 with that domain.

### 10. Sign in and add people
1. Open the app's address and sign in with the master account (Google, or the email and password if you set one
   in step 8).
2. **Master** screen: add each operations person (name, the email they will sign in with, and an **initial
   password** of at least 8 characters).
3. **Advisors** screen (operations or master): **Add advisor** with full name, advisor ID (e.g. `ADV001`),
   region, their email and an **initial password**. Advisors are ranked by the belt system from their entries
   each week; there is nothing else to set up.

Everyone can then sign in with that email and password, or with Google using the same email. Tell each person
their initial password; they (or you) can change it afterwards:
- **They** can use **Forgot password?** on the sign-in screen to get a reset link by email.
- **You** can reset it for them: on the **Advisors** screen (for advisors) or the **Operations accounts** screen
  (master, for operations accounts), click **Reset password** next to the person and set a new one. An operations
  manager can reset only advisors in their own region; the master can reset anyone.

To remove someone, click **Deactivate** next to them: they lose access at once and are signed out
(**Reactivate** undoes it).

### 11. Put the app on the advisors' phones
- **Android**: build the advisor app once and send it to them, or publish it on Google Play: see
  [Android app for advisors](#android-app-for-advisors) just below.
- **iPhone** (there is no iPhone app): open the app's address in Safari, sign in with Google, then the Share
  button > **Add to Home Screen**.

### Later: publishing a new version
Run `npx firebase deploy` again in the project folder (`npx firebase deploy --only apphosting` if only the app
changed). The data is not touched. The Android app shows the new version by itself (it opens the live site), so it
does not need to be rebuilt or reinstalled.

### Troubleshooting
- **The master sees "You don't have access"**: the email in step 8 must be exactly the Google account used to
  sign in. Run step 8 again with the right email.
- **Deploying the function fails with "missing permission on the build service account"** (some new company
  Google Cloud setups): open https://console.cloud.google.com/iam-admin/iam, click the pencil next to
  "Compute Engine default service account" (`<number>-compute@developer.gserviceaccount.com`), **Add another
  role** > "Cloud Build Service Account", **Save**, and run step 7 again.
- **On a phone, sign-in returns to the sign-in screen**, or the pop-up is blocked: finish step 9. The link
  "Pop-up blocked or stuck? Sign in on this page instead" on the sign-in screen uses the same page-based sign-in.
- **Costs**: Firebase console > **Usage and billing**, or the budget alert emails from step 2.

---

## Android app for advisors

Advisors get an Android app; operations and master keep using the website on a computer. The app opens the
advisor pages of the live site (`/advisor`) full screen in Chrome (a "Trusted Web Activity"). So Google sign-in
works as on the website, every change you deploy reaches the phones at once without reinstalling, and the app
opens even without signal (it keeps a copy of its pages; entries made offline sync later). Phones need Android 5
or newer with Chrome, which almost every Android phone has.

You build the app on your own computer (Windows, Mac or Linux), after go-live steps 1-9: the site must be live
(step 7), and sign-in must work on its own address (step 9), because the app signs in the same way. Allow about
3 GB of disk space and 30-60 minutes for the first build; later builds take a few minutes.

### A1. Build the app
Open a terminal in the project folder (as in the go-live guide; on Windows, Command Prompt or PowerShell) and run
this with your app's address from step 7, without `https://`:
```
npm run build:apk -- --host tba-drop-letter--your-project-id.<region>.hosted.app
```
- The first time, it explains that Java 17 and Google's Android SDK are needed (downloaded once, several hundred
  MB) and asks whether you accept the Android SDK terms (https://developer.android.com/studio/terms). Type `y`
  and press Enter.
- It then creates the app's **signing key** and asks you to choose its password, twice (nothing shows while you
  type): 10 or more letters, digits, dots, dashes or underscores, for example three words joined with dashes.
  Read A2 before you continue.
- At the end it prints where the app is and the key's **SHA-256 fingerprint** (a line like `AB:CD:12:...`):
  - `android/output/tba-drop-letter.apk`: the app to send to phones;
  - `android/output/tba-drop-letter.aab`: the same app for Google Play.

### A2. Keep the signing key safe
The key is the file `tba-drop-letter.keystore` in the folder `tba-drop-letter-signing` in your user folder (on
Windows `C:\Users\<you>\tba-drop-letter-signing`), together with its password. Android installs an update only if
it is signed with the same key, so **every future build needs both**.
- **Back it up now**: copy the `tba-drop-letter-signing` folder to a USB stick or a company drive, and keep the
  password in a password manager (or on paper in a safe place), not next to the file.
- **If you lose either one**, the app can no longer be updated: everyone has to uninstall it and install a new
  app. (On Google Play, Google can reset a lost upload key; see A4.)
- **Keep it private**: whoever has the key and its password can make an app that phones accept as an update of
  yours. Never email it, put it in the project folder or upload it anywhere.
- To build on another computer, copy the folder to the same place there, or add
  `--keystore <path to the .keystore file>` to the command.

### A3. Connect the app to the site
Until the site lists the key's fingerprint, the app works but shows a browser address bar at the top. Once:
1. Open `apphosting.yaml` in the project folder. At the end, delete the `# ` at the start of the three
   `ANDROID_CERT_SHA256` lines and replace `AB:CD:EF:...:12` with the fingerprint from A1 (keep the quotes). Save.
2. Deploy: `npx firebase deploy --only apphosting`.
3. Open `https://<your app's address>/.well-known/assetlinks.json` in a browser: it shows your fingerprint.

Then close the app on the phone and open it again; if the bar is still there after a few hours, reinstall the app.

### A4. Give the app to the advisors
**Directly** (simplest for a small team): send `tba-drop-letter.apk` by WhatsApp, email or Google Drive. On the
phone, open the file and tap **Install**. The first time, Android asks to allow installing apps from that source
(**Settings** > **Allow from this source**). If Play Protect warns about an unknown app, tap **More details** >
**Install anyway**. Then open **TBA Drop Letter** and sign in with Google.

**Google Play** (updates arrive by themselves, no warnings):
1. Create a Google Play developer account at https://play.google.com/console (a one-time US$25 fee and an
   identity check; an organisation account needs a D-U-N-S number).
2. **Create app** and upload `tba-drop-letter.aab` to a release. For staff only, use **Internal testing** (up to
   100 people, invited by email) or a closed test; a public release needs a store listing, a privacy policy and
   Google's review.
3. Google signs apps from Play with its own key, so the site must list that key too. In Play Console open **App
   integrity** > **App signing**, copy the SHA-256 of the **App signing key certificate**, add it in
   `apphosting.yaml` after your own fingerprint with a comma between them (`value: "AB:CD:...:12, 98:76:...:EF"`),
   and deploy again (A3, step 2).
4. On Play, your own key is the "upload key". If it is lost, Google can reset it (App integrity > App signing).

### Updating the Android app
Changes to the website reach the app by themselves. Build again only to change the app's name, icon, colours or
address, or when Google Play asks for a newer Android version: run the same command, with the same key and
password (the version number goes up by itself). Advisors install the new `.apk` over the old one, keeping their
data, or Google Play updates it.

### Good to know
- **Package name**: the app's ID on Android and Google Play is `com.tba.dropletter`, a placeholder. **It can never
  change once the app is published on Google Play** (another ID is another app). To use a different one, change it
  before the first release in both `android/twa-manifest.json` (`packageId`) and `apphosting.yaml`
  (`ANDROID_PACKAGE_NAME`). The app's name, colours and icons are also in `android/twa-manifest.json`.
- **New address** (for example your own domain): build again with the new `--host`, and repeat go-live step 9.
- **When nobody can answer questions in the terminal** (for example, Claude Code builds it for you through Remote
  Control): the first run needs `--accept-android-sdk-terms` added to the command, which accepts the Android SDK
  terms, so add it only once you have read and accepted them. The key's password then comes from the variable
  `TBA_SIGNING_PASSWORD`. Set it yourself in the terminal before you start Claude Code there, so the password never
  passes through a chat: Command Prompt `set TBA_SIGNING_PASSWORD=your-password`, PowerShell
  `$env:TBA_SIGNING_PASSWORD="your-password"`, Mac/Linux `export TBA_SIGNING_PASSWORD=your-password`.
- **Windows user name with a space** (`C:\Users\Jane Doe`): the build tools go to `C:\bubblewrap` instead, because
  they do not work from a folder with a space in its name.
- All options: `npm run build:apk -- --help`. The script is `scripts/build-apk.mjs`; it regenerates the Android
  project in `android/build/` on every run (not committed) with Bubblewrap (`@bubblewrap/cli`), whose settings
  file is `~/.bubblewrap/config.json`.

### Troubleshooting the Android app
- **A browser bar shows at the top**: `/.well-known/assetlinks.json` does not list the key the app was signed with
  (A3; for a copy installed from Google Play, Play's key, A4 step 3). Fix it, deploy, and reopen the app.
- **Sign-in returns to the sign-in screen**: finish go-live step 9.
- **"App not installed" when updating**: the phone has a copy signed with another key. Uninstall it first.
- **The build stops while downloading**: check the internet connection and run the same command again; what
  was already downloaded is kept.

---

## How it works on Firebase

### Sign-in and the access list
- Two sign-in methods for every role (`src/lib/data/firebase.ts`), both using Firebase Authentication and keyed by
  email: **email + password** (`signInWithEmailAndPassword`), and **Google** — a pop-up first, then the page-based
  redirect when the pop-up is blocked or not supported, in the iPhone home-screen app, in the Android app (detected
  by its `android-app://` referrer, remembered for the session), or from the "Sign in on this page" link.
  Passwords are stored and checked by Firebase Authentication; nothing about them is ever written to Firestore.
- After sign-in the browser calls the server action `claimAccess` (`src/app/actions.ts`, Admin SDK). It verifies
  the ID token (a Google or password provider, verified email) and looks the email up in `users`. Not listed: the
  new Auth account is deleted and the person sees "You don't have access". Deactivated: the Auth account is
  disabled and its sessions revoked. Otherwise it stores the custom claims `{ role, pid }` (pid = the `users`
  document ID) and the Auth uid on the entry.
- When an admin adds a user, `createAdvisor`/`createOpsUser` also provision that person's Firebase Auth user with
  the initial password (`admin.auth().createUser`, email marked verified because it is the access-list email).
  `resetUserPassword` sets a new password (`admin.auth().updateUser`) for a user the caller manages — the master
  for any operations account or advisor, an operations manager only for advisors in its own region (enforced by
  `canResetPassword` in `src/lib/data/authz.ts`). People can also reset their own password by email
  (`sendPasswordResetEmail`, the "Forgot password?" link). Every server action verifies the caller's ID token
  (including revocation) and role again, against the `users` entry.
- Deactivating disables the Auth account and revokes its refresh tokens; the security rules also re-read the
  `users` entry on every request, so access stops at once, not when the token expires. The auth method does not
  change anyone's role or region, so the Firestore security rules are unchanged.
- The first master: `scripts/create-master.mjs` (`npm run create-master`, with an optional `--password`).

### Data (Firestore)
| Collection | Contents | Written by |
|---|---|---|
| `users` | access list: role, full_name, email, advisor_code, region, active, uid | server only |
| `drops` | one letter each: advisor_id, office_number, company_name, building_name, block_no, area, city, full_address, drop_date, responded, response_type/date/notes/phone/email, created_at, search_tokens | the advisor |
| `buildings` | one per advisor and building (`<pid>__<key>`), for the building/city filters and "buildings covered" | the advisor |
| `direct_leads` | contact_name, company_name, phone, email, notes, lead_date, drop_id | the advisor |
| `weekly_results` | the weekly belt snapshot: letters and belt per advisor, one per advisor and Monday (the week's start) | the weekly job |

### Security rules (`firestore.rules`)
- Nothing is readable or writable without the claims of an active, listed person whose entry still matches
  (uid, role); unlisted and deactivated people get nothing.
- Advisors create, read and update only their own drops, leads and buildings; they cannot change `advisor_id` or
  `created_at` and cannot delete. Required fields, lengths and dates are checked, and a responded drop must have a
  response date and a valid phone number or email (or both).
- Operations and master read everything. The access list and the weekly belt snapshot (`weekly_results`) are
  written only by the server; advisors read only their own `weekly_results` rows.

### Search and filters
Firestore has no full-text search, so each drop stores `search_tokens`: every prefix (up to 20 characters) of
the words of its office number, company name and building name, plus `b:<building>` and `c:<city>` keys
(`src/lib/search.ts`). A search sends the longest typed word as one `array-contains` condition together with
the advisor, responded and date-range conditions; the other words and the building/city filter are applied in
the app. Composite indexes are in `firestore.indexes.json`. With one search word (or none) results page from
Firestore and totals come from count queries; with several words the app reads up to 3,000 matching drops and
shows "N shown" instead of totals.

### Reports
Dashboards, month-wise analytics and weekly progress use Firestore count aggregation queries
(`getCountFromServer`), which cost one read per 1,000 counted entries, instead of downloading drops. The Excel
export reads the filtered drops in pages of 500.

### Weekly belt snapshot (`functions/`)
`weeklySnapshot` is a 2nd-gen scheduled function (region asia-south1) that runs every Monday at 09:00 India time.
For each active advisor it counts the entries of the competition week that just ended (Monday 09:00 to Monday 09:00,
using the same week maths as the app — `functions/src/weekly/week.ts`, matching `currentWeek()` in
`src/lib/stats.ts`, unit-tested) and records the advisor's final belt for that week in
`weekly_results/<advisor>_<monday>`. The record is created only if it does not already exist, so running the job
twice for the same week changes nothing. Belts are the sole ranking (Red < 200, Yellow 200-349, Blue 350-500,
Green 501+); there is no promotion, demotion or level history.

### Offline
Firestore offline persistence is on (IndexedDB, multi-tab). An advisor who loses signal while the app is open can
keep saving drops and responses; they are kept on the phone and sync on their own when the connection is back
(the header shows "Offline" and any sync error). Sign-out is refused while entries are still waiting to sync, and
it clears the phone's copy of the data.

The advisor app also opens from scratch without signal. A service worker (`public/advisor-sw.js`, registered by
`src/lib/advisor-offline.ts` with scope `/advisor`) stores the advisor pages and their scripts, styles and fonts
when it installs. Advisor pages come from the network when it answers within 4 seconds and from the stored copy
otherwise; `/_next/static` files (their names change with every build) come from the copy first. Data, sign-in and
server actions are never touched by it, and Firebase Auth and Firestore keep the user and the data offline. It is
registered as `/advisor-sw.js?v=<NEXT_PUBLIC_BUILD_ID>`, a new ID per build (`next.config.ts`), so every deploy
installs a fresh copy and deletes the old one. It is only used in production builds with Firebase: not in demo
mode, `next dev` or the preview, and never on the operations and master pages (outside its scope). A drop's
response page is one static page for every drop (`/advisor/drop?id=<id>`), so the stored copy covers them all.
Offline, Next.js cannot fetch a page's data for an in-app link, so it loads the page from the copy instead (it
logs "Failed to fetch RSC payload", which is expected).

### Hosting and configuration
- `apphosting.yaml` (Firebase App Hosting, the default): turns off demo mode; the Firebase web settings come from
  the web app linked to the backend (`FIREBASE_WEBAPP_CONFIG`, mapped in `next.config.ts`); the server uses the
  backend's service account, so no key is needed.
- `firebase.json`: Firestore rules and indexes, the functions, the App Hosting backend `tba-drop-letter`, and the
  emulators. `.firebaserc`: the project ID (placeholder until step 6).
- `.env.example` lists every variable. Never commit `.env.local` or service account keys (both are git-ignored).
- **Other hosts** (Vercel, Cloud Run, a VPS): `npm run build && npm start` with Node 22 or 24, and set
  `NEXT_PUBLIC_USE_MOCK=false`, the `NEXT_PUBLIC_FIREBASE_*` values (Firebase console > Project settings > Your
  apps > Web app) and `FIREBASE_SERVICE_ACCOUNT_KEY` (a service account key as JSON or base64; a secret). Deploy
  the rules, indexes and function with `npx firebase deploy --only firestore,functions`.
- **Redirect sign-in and `authDomain`**: redirect sign-in comes back through `https://<authDomain>/__/auth/handler`.
  Browsers that block third-party storage (Safari, installed web apps) lose the result when that is a different
  domain (`<project>.firebaseapp.com`). So in production `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is the app's own
  domain, and `next.config.ts` forwards `/__/auth/*` and `/__/firebase/*` to `https://<project>.firebaseapp.com`
  (override with `FIREBASE_AUTH_HELPER_ORIGIN`). The domain must also be an authorized domain in Firebase
  Authentication, and `https://<domain>/__/auth/handler` an authorized redirect URI of the OAuth web client. This
  works on any host that runs the Next.js server; go-live step 9 has the clicks.
- **Android app** (Trusted Web Activity, built with Bubblewrap): `android/twa-manifest.json` holds its settings
  (package `com.tba.dropletter`, start URL `/advisor`, name, colours, icons from `public/icons/`); the host is a
  placeholder that `scripts/build-apk.mjs` (`npm run build:apk -- --host <domain>`) fills in when it regenerates the
  project in `android/build/` (git-ignored, like `android/output/` and `*.keystore`). The script downloads JDK 17 and
  the Android SDK command-line tools with Bubblewrap's own installers, creates the signing key (PKCS12, outside the
  project), and serves the icons to Bubblewrap from `public/` itself. Chrome shows the app without a browser bar
  when `/.well-known/assetlinks.json` (`src/app/.well-known/assetlinks.json/route.ts`, built at request time from
  `ANDROID_PACKAGE_NAME` and the comma-separated `ANDROID_CERT_SHA256`) lists the app's signing key.
  `public/advisor.webmanifest` meets the TWA requirements (standalone, start URL, theme colours, 512px icons
  including a maskable one).

### Code layout
- `src/lib/data/`: data layer; `types.ts` (the `DataApi` interface), `mock.ts` (demo data in localStorage, same
  access rules), `firebase.ts` (Firebase); `index.ts` picks one with `NEXT_PUBLIC_USE_MOCK`.
- `src/lib/firebase/`: browser (`client.ts`) and Admin SDK (`admin.ts`) setup; `src/app/actions.ts`: server actions.
- `src/lib/search.ts` search words and tokens; `src/lib/stats.ts` totals and month grouping; `src/lib/validate.ts`.
- `src/components/ui.tsx` shared UI, role guard, navigation, sync banner; `src/app/advisor/*`, `src/app/ops/*`,
  `src/app/master`, `src/app/login`, `src/app/not-authorised`, `src/app/.well-known/assetlinks.json`.
- `public/advisor-sw.js` and `src/lib/advisor-offline.ts`: the advisor app's offline copy.
- `android/twa-manifest.json`: the Android app's settings.
- `firestore.rules`, `firestore.indexes.json`, `functions/` (weekly job), `scripts/` (create-master, emulator seed,
  Android build), `tests/` (rules tests, end-to-end test).

## Local development with the emulators
Needs Java 21 or newer for the Firestore emulator.
1. `npm install` and `npm --prefix functions install`.
2. Create `.env.local`:
   ```
   NEXT_PUBLIC_USE_MOCK=false
   NEXT_PUBLIC_FIREBASE_USE_EMULATORS=true
   NEXT_PUBLIC_FIREBASE_API_KEY=demo-api-key
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-tba
   NEXT_PUBLIC_FIREBASE_APP_ID=demo-app-id
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=127.0.0.1
   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
   ```
3. Terminal 1: `npm run emulators` (Auth, Firestore, Functions, Pub/Sub; UI at http://127.0.0.1:4000).
   Terminal 2: `npm run emulators:seed` (clears the emulators, adds 5 people and about 340 drops), then `npm run dev`.
4. Sign in through the Auth emulator's Google page with one of: `master@example.com`, `ops@example.com`,
   `riya.shah@example.com`, `karan.mehta@example.com`, `neha.desai@example.com`. Any other email is refused.
5. Run the weekly job by hand: `curl -X POST http://127.0.0.1:5001/demo-tba/asia-south1/weeklySnapshot-0`.

## Tests
```
npm test            # security rules (tests/rules) + week maths and weekly snapshot (functions/src/weekly/*.test.ts)
npm run test:e2e    # browser test of the main flows against the emulators
npm run lint && npm run build
```
- `npm test` starts the Firestore emulator itself (`firebase emulators:exec`).
- `npm run test:e2e` needs Playwright with Chromium installed globally (`npm i -g playwright` and
  `npx playwright install chromium`). It seeds the emulators, builds the app into `.next-e2e`, and checks: an
  unlisted person is refused; an advisor adds a drop, logs a response, and saves a drop offline that syncs later;
  with the browser offline and the app server stopped, the advisor app starts from its offline copy and opens a drop
  and New drop; operations uses the dashboard (outside the service worker's scope), search, Excel export, adds and
  deactivates an advisor; master adds an operations user who then signs in; the deactivated
  advisor is refused; the weekly belt snapshot runs twice with no change the second time; `assetlinks.json`, the manifest and
  its icons are served as the Android app needs. Screenshots go to `tests/e2e/output/`.
- The real Google sign-in page needs internet access. The test hands the emulator a Google account directly
  (`window.__E2E_GOOGLE_ACCOUNT`, honoured only in emulator builds); `E2E_POPUP=1` uses the emulator's pop-up.

## Clickable preview (single HTML file)
`npm run preview:build` bundles the real screens, the mock data layer and the sample data into
`preview/dist/index.html` (one self-contained file, no server). `next/*` imports are shimmed with an in-memory
router (`preview/src/shims`) and the Firebase code is left out. Inside the claude.ai viewer the Excel export goes
through the viewer's save prompt (the artifact `downloads` capability); opened as a plain file it downloads normally.

## Demo site on Netlify
`npm run build:demo` builds the same demo for any static host: `preview/dist-demo/index.html`, one self-contained
page (fonts and icon inlined) with the routes in the URL hash (`#/advisor`), so back, reload and shared links work,
and a normal browser download for the Excel export. It has no Firebase code and no service worker, needs no
environment variables or secrets, and makes no requests beyond the page itself. Each visitor gets their own copy of
the sample data in their browser; nothing is saved on a server or shared between visitors.
- Netlify Drop: run `npm run build:demo`, then drag the `preview/dist-demo` folder onto https://app.netlify.com/drop.
- From GitHub: in Netlify, Add new site > Import an existing project, and pick this repository. `netlify.toml` sets
  everything (build command `npm run build:demo`, publish folder `preview/dist-demo`, Node 22), so leave the build
  settings as they are. It only builds the demo; the live app is still deployed to Firebase (see above).
