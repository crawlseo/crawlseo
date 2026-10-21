import { getDateRange } from "@/lib/date-utils";
import type { Period } from "@/lib/seo-metrics";

/** A request the API refuses, with the status and message it answers with. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Search Console keeps 16 months of data. */
export const MAX_PERIOD_DAYS = 490;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** An integer query parameter in [min, max], or the default when it is absent. */
export function intParam(params: URLSearchParams, name: string, def: number, min: number, max: number): number {
  const raw = params.get(name);
  if (raw === null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ApiError(400, `${name} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

/** One of the allowed values, upper-cased, or undefined when absent. */
export function enumParam<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[]): T | undefined {
  const raw = params.get(name);
  if (raw === null || raw === "") return undefined;
  const value = raw.toUpperCase() as T;
  if (!allowed.includes(value)) throw new ApiError(400, `${name} must be one of ${allowed.join(", ")}`);
  return value;
}

export type ResolvedPeriod = { period: Period; startDate: string; endDate: string };

/**
 * The period of a Search Console query: startDate and endDate (YYYY-MM-DD,
 * both included), or days (the last N days), or the default number of days.
 */
export function periodParam(params: URLSearchParams, defaultDays: number): ResolvedPeriod {
  const startDate = params.get("startDate") || null;
  const endDate = params.get("endDate") || null;
  if (startDate || endDate) {
    if (!startDate || !endDate) throw new ApiError(400, "startDate and endDate go together");
    if (params.get("days")) throw new ApiError(400, "Use either days or startDate and endDate");
    if (!isDate(startDate) || !isDate(endDate)) throw new ApiError(400, "Dates must be YYYY-MM-DD");
    const span = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
    if (span < 1) throw new ApiError(400, "endDate is before startDate");
    if (span > MAX_PERIOD_DAYS) throw new ApiError(400, `A period may span at most ${MAX_PERIOD_DAYS} days`);
    return { period: { startDate, endDate }, startDate, endDate };
  }
  const days = intParam(params, "days", defaultDays, 1, MAX_PERIOD_DAYS);
  const { start, end } = getDateRange(days);
  return { period: days, startDate: start, endDate: end };
}
