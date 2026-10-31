/**
 * Welcome emails: what a new advisor ({@link buildWelcomeEmail}) or a new regional account — a State/City President
 * or TBA India Ops ({@link buildRegionalWelcomeEmail}) — is sent when their account is created: their login (email +
 * the initial/temporary password), the web portal link, and short steps to add the app to the phone's home screen.
 * There is no Play Store, App Store or APK: the app is the website, installed as a home-screen app (a PWA) that
 * opens full screen with the TBA icon on Android and iPhone alike.
 *
 * This module is PURE and runtime-neutral: no `server-only`, no nodemailer, no React, no `process.env`. So the
 * same {@link buildWelcomeEmail} renders the email on the server (to actually send, via `email.server.ts`), in the
 * demo (to preview it, via `src/lib/data/mock.ts`) and in unit tests. The SMTP transport lives in `email.server.ts`.
 *
 * SECURITY: the body contains the advisor's password by design (that is the whole point of the email). It is built
 * here from values passed in and is never logged or written to Firestore. Keep it that way.
 */

/** Default sender; overridable with the MAIL_FROM env var (see `email.server.ts`). */
export const DEFAULT_MAIL_FROM = "indiaops@tbaindia.in";

/** The rendered email body. */
export type WelcomeEmailContent = { subject: string; text: string; html: string };

/** Everything the welcome email needs. `email` is the advisor's login (username); `password` is the initial one. */
export type WelcomeEmailFields = {
  name: string;
  advisorId: string;
  email: string;
  password: string;
  /** The web portal address (APP_URL), e.g. https://app.tbaindia.in. */
  appUrl: string;
};

/** Everything the regional-account welcome email needs. `title` is the display title, e.g. "Gujarat President". */
export type RegionalWelcomeEmailFields = {
  name: string;
  title: string;
  email: string;
  password: string;
  appUrl: string;
};

/** A ready-to-send message (envelope + body); also the shape the demo previews. */
export type MailMessage = { from: string; to: string } & WelcomeEmailContent;

/** The sliver of a mail transport we depend on, so the delivery step can be unit-tested with a fake. */
export interface MailSender {
  sendMail(message: MailMessage): Promise<unknown>;
}

/** Escapes text for safe interpolation into the HTML body. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** How to put the app on the home screen, per phone. Kept short: the person reads it on their phone. */
export const ANDROID_STEPS = 'Android: open the link in Chrome, sign in, then tap "Install app" (or Chrome menu \u22ee, then "Add to Home screen").';
export const IPHONE_STEPS = 'iPhone: open the link in Safari, tap Share, then "Add to Home Screen".';
/** After installing: what to expect. */
export const INSTALLED_NOTE = "The TBA icon then appears on your home screen and opens the app full screen. Nothing to download from a store, and it always opens the latest version.";

const textInstall = (appUrl: string) => [
  "Open the app",
  `  ${appUrl}`,
  "Add it to your phone's home screen:",
  `  ${ANDROID_STEPS}`,
  `  ${IPHONE_STEPS}`,
  INSTALLED_NOTE,
  "On a computer, just open the same link in your browser.",
];

const htmlInstall = (appUrl: string) => `<h2 style="margin:0 0 8px;font-size:15px;">Open the app</h2>
      <p style="margin:0 0 12px;">
        <a href="${esc(appUrl)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">Open TBA Drop Letter</a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#475569;word-break:break-all;"><a href="${esc(appUrl)}" style="color:#15803d;">${esc(appUrl)}</a></p>
      <p style="margin:0 0 6px;"><strong>Add it to your phone&rsquo;s home screen</strong></p>
      <ul style="margin:0 0 8px;padding-left:20px;">
        <li style="margin:0 0 4px;">${esc(ANDROID_STEPS)}</li>
        <li style="margin:0 0 4px;">${esc(IPHONE_STEPS)}</li>
      </ul>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;">${esc(INSTALLED_NOTE)} On a computer, just open the same link in your browser.</p>`;

/**
 * Builds the welcome email (subject + plain text + simple HTML). Pure: the output depends only on the input, so it
 * is easy to test and renders identically wherever it is used. The HTML escapes every interpolated value.
 */
export function buildWelcomeEmail({ name, advisorId, email, password, appUrl }: WelcomeEmailFields): WelcomeEmailContent {
  const subject = "Welcome to TBA Drop Letter — your login and how to install the app";

  const text = [
    `Hi ${name},`,
    "",
    "Welcome to TBA Drop Letter. An account has been created for you.",
    "",
    "Your login",
    `  Username (email): ${email}`,
    `  Password: ${password}`,
    `  Advisor ID: ${advisorId}`,
    "",
    ...textInstall(appUrl),
    "",
    "Sign in with the email and password above.",
    'You can change your password later using "Forgot password?" on the sign-in screen.',
    "",
    "— TBA Drop Letter",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#15803d;color:#ffffff;padding:16px 24px;font-weight:bold;font-size:16px;">TBA Drop Letter</div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;">Welcome to TBA Drop Letter. An account has been created for you.</p>
      <h2 style="margin:0 0 8px;font-size:15px;">Your login</h2>
      <table style="border-collapse:collapse;margin:0 0 20px;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#475569;">Username (email)</td><td style="padding:4px 0;"><strong>${esc(email)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#475569;">Password</td><td style="padding:4px 0;"><strong>${esc(password)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#475569;">Advisor ID</td><td style="padding:4px 0;"><strong>${esc(advisorId)}</strong></td></tr>
      </table>
      ${htmlInstall(appUrl)}
      <p style="margin:0 0 16px;">Sign in with the email and password above.</p>
      <p style="margin:0;font-size:13px;color:#475569;">You can change your password later using &ldquo;Forgot password?&rdquo; on the sign-in screen.</p>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">TBA Drop Letter</div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Builds the welcome email for a regional account (State/City President or TBA India Ops). Pure, like
 * {@link buildWelcomeEmail}: name, role title, sign-in username, the temporary password, the web portal link (and
 * that Google sign-in with the same Gmail also works), and the add-to-home-screen steps.
 */
export function buildRegionalWelcomeEmail({ name, title, email, password, appUrl }: RegionalWelcomeEmailFields): WelcomeEmailContent {
  const subject = `Welcome to TBA Drop Letter — your ${title} login`;
  const google = "You can also use \"Sign in with Google\" with this same Gmail address.";

  const text = [
    `Hi ${name},`,
    "",
    `Welcome to TBA Drop Letter. An account has been created for you as ${title}.`,
    "",
    "Your login",
    `  Username (email): ${email}`,
    `  Temporary password: ${password}`,
    "",
    ...textInstall(appUrl),
    "",
    google,
    "",
    'Please change your password after signing in, using "Forgot password?" on the sign-in screen.',
    "",
    "— TBA Drop Letter",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <div style="background:#15803d;color:#ffffff;padding:16px 24px;font-weight:bold;font-size:16px;">TBA Drop Letter</div>
    <div style="padding:24px;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Hi ${esc(name)},</p>
      <p style="margin:0 0 16px;">Welcome to TBA Drop Letter. An account has been created for you as <strong>${esc(title)}</strong>.</p>
      <h2 style="margin:0 0 8px;font-size:15px;">Your login</h2>
      <table style="border-collapse:collapse;margin:0 0 20px;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#475569;">Username (email)</td><td style="padding:4px 0;"><strong>${esc(email)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#475569;">Temporary password</td><td style="padding:4px 0;"><strong>${esc(password)}</strong></td></tr>
      </table>
      ${htmlInstall(appUrl)}
      <p style="margin:0 0 16px;">${esc(google)}</p>
      <p style="margin:0;font-size:13px;color:#475569;">Please change your password after signing in, using &ldquo;Forgot password?&rdquo; on the sign-in screen.</p>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">TBA Drop Letter</div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Delivers a message through the given transport. Never throws: a send failure is caught and reported, so advisor
 * creation can treat the welcome email as non-fatal. The reason is a short, non-sensitive message (no credentials).
 */
export async function sendMail(sender: MailSender, message: MailMessage): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await sender.sendMail(message);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
