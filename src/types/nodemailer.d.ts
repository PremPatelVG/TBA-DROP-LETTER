// Minimal ambient types for the subset of nodemailer this project uses (src/lib/email.server.ts).
// nodemailer ships no type definitions of its own; the DefinitelyTyped package @types/nodemailer is
// intentionally NOT added (the welcome-email feature adds nodemailer only). Keep this in sync with the
// few members we call: createTransport({...}) and transporter.sendMail({...}).
declare module "nodemailer" {
  export interface SmtpTransportOptions {
    host?: string;
    port?: number;
    /** true for an implicit TLS port (usually 465); false for STARTTLS (usually 587). */
    secure?: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout?: number;
    greetingTimeout?: number;
    socketTimeout?: number;
  }
  export interface SendMailOptions {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
  }
  export interface SentMessageInfo {
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
    response?: string;
  }
  export interface Transporter {
    sendMail(mail: SendMailOptions): Promise<SentMessageInfo>;
  }
  export function createTransport(options: SmtpTransportOptions): Transporter;
  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
