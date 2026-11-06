/** Days between today and the newest date with final data in GSC. */
const GSC_LAG_DAYS = 3;

/**
 * Format date to YYYY-MM-DD for Google APIs
 */
export function formatDateForAPI(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Get date N days ago in YYYY-MM-DD format
 */
export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return formatDateForAPI(date);
}

/**
 * Get date range for the last N days GSC has data for: exactly N dates, ending
 * at the lag boundary. Period comparisons build the previous period from this
 * start, so ending any later would compare a short period with a full one.
 */
export function getDateRange(days: number): { start: string; end: string } {
  return {
    start: getDateDaysAgo(GSC_LAG_DAYS + days - 1),
    end: getDataLagDate(),
  };
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentChange(
  current: number,
  previous: number
): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 100) / 100;
}

/**
 * Returns the approximate latest date (YYYY-MM-DD) for which GSC data
 * is available. Google typically has a ~3-day lag.
 */
export function getDataLagDate(): string {
  return getDateDaysAgo(GSC_LAG_DAYS);
}

/**
 * Format large numbers with K/M suffix
 */
export function formatLargeNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
