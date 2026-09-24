const GSC_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Turns a GSC day ("2026-09-14") into the Date stored in Keyword.date and
 * Page.date: UTC midnight of that day, whatever the host timezone is.
 *
 * Every writer must go through this. The unique keys are
 * [siteId, query, date] and [siteId, url, date], so two writers that
 * disagree on the timestamp for the same day store that day twice.
 * The read path (lib/seo-metrics.ts) builds its ranges at T00:00:00.000Z.
 */
export function gscDate(day: string): Date {
  const match = GSC_DATE.exec(day);
  if (!match) {
    throw new Error(`Invalid GSC date "${day}": expected YYYY-MM-DD`);
  }

  const [, y, m, d] = match;
  const date = new Date(`${y}-${m}-${d}T00:00:00.000Z`);

  // The Date constructor rolls 2026-02-30 over to March; reject it instead.
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    throw new Error(`Invalid GSC date "${day}": no such calendar day`);
  }

  return date;
}
