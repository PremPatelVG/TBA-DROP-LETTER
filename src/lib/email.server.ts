import "server-only";
import nodemailer from "nodemailer";
import { buildRegionalWelcomeEmail, buildWelcomeEmail, DEFAULT_MAIL_FROM, sendMail, type MailMessage, type WelcomeEmailContent } from "@/lib/email";
import type { WelcomeEmailResult } from "@/lib/data/types";

/**
 * Server-only SMTP transport for the welcome emails (advisors and regional accounts). The pure bodies are built in
 * `src/lib/email.ts` (shared with the demo and the tests); this module only reads the config from the environment
 * and sends. It is imported solely by the server actions, so nodemailer never reaches the browser.
 *
 * Config (all via env, never committed — see `.env.example`):
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" ⇒ implicit TLS, e.g. port 465), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM (default indiaops@tbaindia.in),
 *   APP_URL (the web portal address; NEXT_PUBLIC_APP_URL is accepted as a fallback).
 *
 * SECURITY: the credentials are read only here and never logged; the password that the email body carries (by
 * design) is never logged either. A failure is caught and reported as a short, non-sensitive reason.
 */

/** The web portal address: APP_URL, falling back to NEXT_PUBLIC_APP_URL. */
export function appUrlFromEnv(): string | undefined {
  return process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || undefined;
}

/** Why the welcome email cannot be sent right now (SMTP or portal link not configured), or null when it can. */
export function welcomeEmailNotReady(): string | null {
  if (!process.env.SMTP_HOST?.trim() || !process.env.SMTP_USER?.trim() || !process.env.SMTP_PASS) {
    return "email is not set up (SMTP_HOST, SMTP_USER and SMTP_PASS are required)";
  }
  if (!appUrlFromEnv()) return "the web portal link is not set (APP_URL)";
  return null;
}

/** Builds (with the configured links) and sends one welcome email. Never throws. */
async function deliver(to: string, build: (links: { appUrl: string }) => WelcomeEmailContent): Promise<WelcomeEmailResult> {
  try {
    // Not configured yet (e.g. before go-live): skip quietly, so account creation still reports a clear reason.
    const notReady = welcomeEmailNotReady();
    if (notReady) return { status: "skipped", reason: notReady };
    const host = process.env.SMTP_HOST!.trim();
    const user = process.env.SMTP_USER!.trim();
    const pass = process.env.SMTP_PASS!;
    const from = process.env.MAIL_FROM?.trim() || DEFAULT_MAIL_FROM;
    const message: MailMessage = { from, to, ...build({ appUrl: appUrlFromEnv()! }) };

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
      // Keep a hung mail server from holding up the response; account creation has already succeeded by now.
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

/** The advisor welcome email (login, Advisor ID, app link + home-screen steps). Best effort: never throws. */
export function sendWelcomeEmail(fields: { name: string; advisorId: string; email: string; password: string }): Promise<WelcomeEmailResult> {
  return deliver(fields.email, (links) => buildWelcomeEmail({ ...fields, ...links }));
}

/** The regional-account welcome email (title, login, app link + home-screen steps). Best effort: never throws. */
export function sendRegionalWelcomeEmail(fields: { name: string; title: string; email: string; password: string }): Promise<WelcomeEmailResult> {
  return deliver(fields.email, (links) => buildRegionalWelcomeEmail({ ...fields, ...links }));
}
