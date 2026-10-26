import nodemailer, { type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { redactSmtp, smtpConfig, type SmtpConfig } from "./config";

/*
 * Sends one email through the operator's SMTP server. One attempt per call;
 * the job queue retries a send that failed for a reason a retry can fix
 * (lib/jobs/handlers.ts, alert-email). Never throws, and no error it returns
 * carries the SMTP login.
 */

/** Connect, greeting and socket idle limit of one send, in ms. */
export const SMTP_TIMEOUT_MS = 10_000;

export type EmailMessage = { to: string[]; subject: string; text: string; html: string };

export type EmailResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** A later attempt may succeed: network error, timeout or an SMTP 4xx answer. */
      retryable: boolean;
    };

type Transport = Pick<Transporter<SMTPTransport.SentMessageInfo>, "sendMail" | "close">;
export type TransportFactory = (options: SMTPTransport.Options) => Transport;

const defaultFactory: TransportFactory = (options) => nodemailer.createTransport(options);

/** Error codes nodemailer gives a failure a retry can fix. */
const RETRYABLE_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED"]);

function describe(err: unknown): { message: string; retryable: boolean } {
  const e = (err ?? {}) as { message?: unknown; code?: unknown; responseCode?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const responseCode = typeof e.responseCode === "number" ? e.responseCode : null;
  const message = typeof e.message === "string" && e.message ? e.message : String(err);
  if (code === "EAUTH") return { message: `The SMTP server refused the login: ${message}`, retryable: false };
  if (responseCode !== null) return { message, retryable: responseCode >= 400 && responseCode < 500 };
  // A TLS mismatch (SMTP_SECURE=true on a STARTTLS port) is a setting to fix, not a network blip.
  if (/ssl|tls|certificate|wrong version/i.test(message)) return { message, retryable: false };
  // An unknown failure is not retried: it is shown in Settings for the operator to look at.
  return { message, retryable: RETRYABLE_CODES.has(code) };
}

export async function sendEmail(
  message: EmailMessage,
  opts: { config?: SmtpConfig | null; timeoutMs?: number; transport?: TransportFactory } = {}
): Promise<EmailResult> {
  const config = opts.config === undefined ? smtpConfig() : opts.config;
  if (!config) return { ok: false, error: "Email is not set up on this server (SMTP_HOST and SMTP_FROM).", retryable: false };
  if (message.to.length === 0) return { ok: false, error: "No recipient.", retryable: false };
  const timeout = opts.timeoutMs ?? SMTP_TIMEOUT_MS;
  let transport: Transport | null = null;
  try {
    transport = (opts.transport ?? defaultFactory)({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.auth && { auth: { user: config.auth.user, pass: config.auth.pass } }),
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
      dnsTimeout: timeout,
      // No protocol log: it would carry the login.
      logger: false,
      debug: false,
    });
    await transport.sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      // Nothing is fetched to build the message.
      disableUrlAccess: true,
      disableFileAccess: true,
    });
    return { ok: true };
  } catch (err) {
    const { message: raw, retryable } = describe(err);
    return { ok: false, error: redactSmtp(`Could not send the email: ${raw}`, config), retryable };
  } finally {
    try {
      transport?.close();
    } catch {
      // Closing a transport that never connected.
    }
  }
}
