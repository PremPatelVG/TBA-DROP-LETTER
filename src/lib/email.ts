/**
 * Welcome email: what a new advisor is sent when their account is created — their login (email + the initial
 * password the admin set) and a link to download the Android app.
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
  apkUrl: string;
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

/**
 * Builds the welcome email (subject + plain text + simple HTML). Pure: the output depends only on the input, so it
 * is easy to test and renders identically wherever it is used. The HTML escapes every interpolated value.
 */
export function buildWelcomeEmail({ name, advisorId, email, password, apkUrl }: WelcomeEmailFields): WelcomeEmailContent {
  const subject = "Welcome to TBA Drop Letter — your login and app download";

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
    "Download the app",
    "Open this link on your phone to install the app:",
    `  ${apkUrl}`,
    "",
    "After installing, open the app and sign in with the email and password above.",
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
      <h2 style="margin:0 0 8px;font-size:15px;">Download the app</h2>
      <p style="margin:0 0 12px;">Open this link <strong>on your phone</strong> to install the app:</p>
      <p style="margin:0 0 20px;">
        <a href="${esc(apkUrl)}" style="display:inline-block;background:#15803d;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">Download the app</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;word-break:break-all;">${esc(apkUrl)}</p>
      <p style="margin:0 0 4px;">After installing, open the app and sign in with the email and password above.</p>
      <p style="margin:0;font-size:13px;color:#475569;">You can change your password later using &ldquo;Forgot password?&rdquo; on the sign-in screen.</p>
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
