/*
 * The addresses alert emails go to, as typed in Settings > Email alerts:
 * separated by commas, semicolons, spaces or line breaks.
 */

export const MAX_RECIPIENTS = 5;
const MAX_ADDRESS_LENGTH = 254;
// Deliberately plain: one @, a dot in the domain, no spaces, colons, quotes or angle brackets.
const ADDRESS = /^[^\s@,;:<>"'()\\]+@[^\s@,;:<>"'()\\]+\.[^\s@,;:<>"'()\\]+$/;

/** The addresses, lower-cased and without duplicates, or an error message. */
export function parseRecipients(raw: unknown): { recipients: string[] } | { error: string } {
  const text = typeof raw === "string" ? raw : "";
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const recipients = [...new Set(parts)];
  if (recipients.length === 0) return { error: "Enter at least one email address." };
  if (recipients.length > MAX_RECIPIENTS) return { error: `At most ${MAX_RECIPIENTS} addresses.` };
  const bad = recipients.find((r) => r.length > MAX_ADDRESS_LENGTH || !ADDRESS.test(r));
  if (bad) return { error: `"${bad.slice(0, 80)}" is not an email address.` };
  return { recipients };
}

/** As stored in UserSettings.alertEmailTo. */
export function joinRecipients(recipients: string[]): string {
  return recipients.join(", ");
}

/** The stored list back as addresses; empty for null. */
export function splitRecipients(stored: string | null | undefined): string[] {
  return (stored ?? "").split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
}
