import "server-only";
import nodemailer from "nodemailer";
import { buildWelcomeEmail, DEFAULT_MAIL_FROM, sendMail, type MailMessage } from "@/lib/email";
import type { WelcomeEmailResult } from "@/lib/data/types";

/**
 * Server-only SMTP transport for the advisor welcome email. The pure body is built by {@link buildWelcomeEmail}
 * (in `src/lib/email.ts`, shared with the demo and the tests); this module only reads the SMTP config from the
 * environment and sends. It is imported solely by the server actions, so nodemailer never reaches the browser.
 *
 * Config (all via env, never committed — see `.env.example`):
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" ⇒ implicit TLS, e.g. port 465), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM (default indiaops@tbaindia.in), ADVISOR_APK_URL (where the built Android app is hosted).
 *
 * SECURITY: the credentials are read only here and never logged; the password that the email body carries (by
 * design) is never logged either. A failure is caught and reported as a short, non-sensitive reason.
 */
export async function sendWelcomeEmail(fields: {
  name: string;
  advisorId: string;
  email: string;
  password: string;
}): Promise<WelcomeEmailResult> {
  try {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS;
    const apkUrl = process.env.ADVISOR_APK_URL?.trim();
    const from = process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;

    // Not configured yet (e.g. before go-live): skip quietly, so advisor creation still reports a clear reason.
    if (!host || !user || !pass) {
      return { status: "skipped", reason: "email is not set up (SMTP_HOST, SMTP_USER and SMTP_PASS are required)" };
    }
    if (!apkUrl) {
      return { status: "skipped", reason: "the app download link is not set (ADVISOR_APK_URL)" };
    }

    const content = buildWelcomeEmail({ name: fields.name, advisorId: fields.advisorId, email: fields.email, password: fields.password, apkUrl });
    const message: MailMessage = { from, to: fields.email, ...content };

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
      // Keep a hung mail server from holding up the response; advisor creation has already succeeded by now.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const result = await sendMail(transporter, message);
    if (result.ok) return { status: "sent" };
    // Log without any secret (no credentials, no body). The reason surfaced to the admin stays generic.
    console.error("welcome email send failed:", result.reason);
    return { status: "failed", reason: "the welcome email could not be sent" };
  } catch (e) {
    console.error("welcome email send failed:", e instanceof Error ? e.message : String(e));
    return { status: "failed", reason: "the welcome email could not be sent" };
  }
}
