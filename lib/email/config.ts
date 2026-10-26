/*
 * Alert emails through the operator's own SMTP server, set in the
 * environment only. The credentials are never stored in the database, never
 * returned by an API, never shown in the UI and never logged.
 */

type Env = Record<string, string | undefined>;

export type SmtpConfig = {
  host: string;
  port: number;
  /** TLS from the start (port 465). false: plain, then STARTTLS when the server offers it. */
  secure: boolean;
  /** Absent: the server takes mail without a login. */
  auth: { user: string; pass: string } | null;
  from: string;
};

/** The variables Settings names when email is not set up. */
export const SMTP_ENV_VARS = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"] as const;

/** ALERT_EMAILS_ENABLED=false turns alert emails off on this server: nothing is sent, Settings shows no form. */
export function emailsEnabled(env: Env = process.env): boolean {
  return env.ALERT_EMAILS_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * The SMTP settings, or null when SMTP_HOST or SMTP_FROM is not set.
 * SMTP_SECURE defaults to true on port 465 and false otherwise; SMTP_PORT
 * defaults to 465 when SMTP_SECURE=true and 587 otherwise.
 */
export function smtpConfig(env: Env = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const secureRaw = env.SMTP_SECURE?.trim().toLowerCase();
  const portRaw = Number(env.SMTP_PORT?.trim());
  const explicitPort = Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : null;
  const secure = secureRaw === "true" ? true : secureRaw === "false" ? false : explicitPort === 465;
  const port = explicitPort ?? (secure ? 465 : 587);
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD ?? "";
  return { host, port, secure, auth: user ? { user, pass } : null, from };
}

/** Whether alert emails can be sent on this server: on, and SMTP set up. */
export function emailAvailable(env: Env = process.env): boolean {
  return emailsEnabled(env) && smtpConfig(env) !== null;
}

/**
 * `text` without the SMTP credentials of `config`, for errors that are
 * stored, shown or logged. A library error can quote the login it tried.
 */
export function redactSmtp(text: string, config: SmtpConfig | null = smtpConfig()): string {
  let out = text;
  const secrets = [config?.auth?.pass, config?.auth?.user].filter((s): s is string => !!s && s.length >= 3);
  for (const secret of secrets) out = out.split(secret).join("[redacted]");
  // An AUTH PLAIN or LOGIN exchange in base64 carries both.
  if (config?.auth) {
    const encoded = [
      Buffer.from(config.auth.user).toString("base64"),
      Buffer.from(config.auth.pass).toString("base64"),
      Buffer.from(`\u0000${config.auth.user}\u0000${config.auth.pass}`).toString("base64"),
    ].filter((s) => s.length >= 4);
    for (const secret of encoded) out = out.split(secret).join("[redacted]");
  }
  return out;
}
