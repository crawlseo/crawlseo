/*
 * Settings > Schedule values, shared by the API route, the scheduler's
 * storage (lib/user-settings.ts) and the form. No server imports: the form
 * runs in the browser.
 */

/** The longest interval Settings accepts, in days. */
export const MAX_SCHEDULE_DAYS = 90;

/** The choices Settings offers. 0 is off. */
export const SCHEDULE_DAY_CHOICES = [0, 1, 3, 7, 14, 28] as const;

/** null: the server default (SCHEDULE_CRAWL_DAYS, SCHEDULE_VITALS_DAYS). 0: off. */
export type ScheduleSettings = { crawlDays: number | null; vitalsDays: number | null };

/** A days value from a request: null for the server default, a whole number 0 to MAX_SCHEDULE_DAYS, or undefined when invalid. */
export function parseScheduleDays(value: unknown): number | null | undefined {
  if (value === null || value === "default") return null;
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_SCHEDULE_DAYS) return undefined;
  return n;
}

/** What the server allows: its default intervals in days (0: off on this server). */
export type ScheduleServerInfo = {
  schedulerEnabled: boolean;
  crawlDefaultDays: number;
  vitalsDefaultDays: number;
  /** No worker runs here; scheduled crawls and vitals checks need one. */
  serverless: boolean;
};

/** Settings > Schedule: the body of GET and PUT /api/user/schedule. */
export type ScheduleView = ScheduleSettings & { server: ScheduleServerInfo };
