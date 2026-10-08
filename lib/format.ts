export function cnDelta(value: number, invert = false): string {
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  if (good) return "text-signal";
  if (bad) return "text-danger";
  return "text-muted-foreground";
}

export function formatDeltaPercent(value: number, locale = "en-US"): string {
  if (!Number.isFinite(value) || value === 0) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDeltaPosition(value: number): string {
  // value is previous - current; positive means improved (moved up)
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return "0.0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The one date format of the app: "3 Oct", "3 Oct 2026" with the year,
 * "3 Oct 14:02 UTC" with the time. Read in UTC, like the GSC dates.
 * A plain "YYYY-MM-DD" string is taken as that calendar day.
 */
export function formatDay(
  value: Date | string,
  {
    year = false,
    time = false,
    locale = "en",
  }: { year?: boolean; time?: boolean; locale?: string } = {},
): string {
  const d =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : new Date(value);
  let out = !locale.startsWith("en")
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(d)
    : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (year) out += ` ${d.getUTCFullYear()}`;
  if (time) {
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    out += ` ${hh}:${mm} UTC`;
  }
  return out;
}

/** A signed delta with a real minus sign: "+8.3", "−3.5". */
export function signed(value: number, digits = 1, locale = "en-US"): string {
  const abs = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(Math.abs(value));
  if (Number(Math.abs(value).toFixed(digits)) === 0) return abs;
  return value > 0 ? `+${abs}` : `−${abs}`;
}
