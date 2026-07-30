import { getAccessToken } from "./google-auth";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const PERF_API = "https://businessprofileperformance.googleapis.com/v1";
const LEGACY_API = "https://mybusiness.googleapis.com/v4";

// Daily metrics we request from the Business Profile Performance API.
const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "WEBSITE_CLICKS",
  "CALL_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
] as const;

type DailyMetric = (typeof DAILY_METRICS)[number];

export interface GBPLocation {
  /** Resource name, e.g. "locations/12345678901234567890" */
  name: string;
  title: string;
  address: string | null;
  phone: string | null;
}

/** Raw per-day metric values as stored in the database. */
export interface GBPRawDaily {
  date: string; // YYYY-MM-DD
  desktopMaps: number;
  desktopSearch: number;
  mobileMaps: number;
  mobileSearch: number;
  websiteClicks: number;
  callClicks: number;
  directionRequests: number;
  conversations: number;
  bookings: number;
}

export interface GBPDailyPoint {
  date: string; // YYYY-MM-DD
  views: number;
  searches: number;
  websiteClicks: number;
  directions: number;
  calls: number;
  interactions: number;
}

export interface GBPMonthlyRow {
  month: string; // YYYY-MM
  label: string; // "Jan 2026"
  views: number;
  searches: number;
  websiteClicks: number;
  directions: number;
  calls: number;
  interactions: number;
}

export interface GBPTotals {
  views: number;
  searches: number;
  websiteClicks: number;
  directions: number;
  calls: number;
  interactions: number;
}

export interface GBPBreakdownSlice {
  label: string;
  value: number;
}

export interface GBPSearchKeyword {
  keyword: string;
  impressions: number;
  approximate: boolean;
}

export interface GBPReviews {
  averageRating: number;
  totalReviews: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export interface GBPSupplemental {
  searchKeywords: GBPSearchKeyword[];
  reviews: GBPReviews | null;
}

export interface GBPReport {
  location: string;
  periodDays: number;
  startDate: string;
  endDate: string;
  totals: GBPTotals;
  previousTotals: GBPTotals;
  deltas: GBPTotals; // percentage change (0-1 scale, e.g. 0.638 = +63.8%)
  daily: GBPDailyPoint[];
  monthly: GBPMonthlyRow[];
  findYou: GBPBreakdownSlice[]; // "How customers find you"
  actions: GBPBreakdownSlice[]; // "Customer actions breakdown"
  searchKeywords: GBPSearchKeyword[];
  reviews: GBPReviews | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function gbpFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Business Profile API error: ${response.status} ${response.statusText}${
        body ? ` — ${body.slice(0, 500)}` : ""
      }`
    );
  }
  return (await response.json()) as T;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Percentage change on a 0-1 scale. Returns 0 when there is no prior data. */
function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

function emptyTotals(): GBPTotals {
  return {
    views: 0,
    searches: 0,
    websiteClicks: 0,
    directions: 0,
    calls: 0,
    interactions: 0,
  };
}

/** Derives the aggregated per-day point shown in charts from a raw row. */
function rawToDailyPoint(r: GBPRawDaily): GBPDailyPoint {
  const searches = r.desktopSearch + r.mobileSearch;
  const maps = r.desktopMaps + r.mobileMaps;
  return {
    date: r.date,
    views: searches + maps,
    searches,
    websiteClicks: r.websiteClicks,
    directions: r.directionRequests,
    calls: r.callClicks,
    interactions:
      r.websiteClicks + r.directionRequests + r.callClicks + r.conversations + r.bookings,
  };
}

// ---------------------------------------------------------------------------
// Location discovery
// ---------------------------------------------------------------------------

interface AccountsResponse {
  accounts?: { name: string }[];
}

interface LocationsResponse {
  locations?: {
    name: string;
    title?: string;
    phoneNumbers?: { primaryPhone?: string };
    storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string };
  }[];
  nextPageToken?: string;
}

/**
 * Lists every Business Profile location the user can manage across all of
 * their accounts.
 */
export async function listGBPLocations(userId: string): Promise<GBPLocation[]> {
  const accessToken = await getAccessToken(userId);

  const accountsData = await gbpFetch<AccountsResponse>(
    `${ACCOUNTS_API}/accounts`,
    accessToken
  );
  const accounts = accountsData.accounts ?? [];

  const readMask = "name,title,phoneNumbers,storefrontAddress";
  const locations: GBPLocation[] = [];

  for (const account of accounts) {
    let pageToken: string | undefined;
    do {
      const url = new URL(`${INFO_API}/${account.name}/locations`);
      url.searchParams.set("readMask", readMask);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const data = await gbpFetch<LocationsResponse>(url.toString(), accessToken);
      for (const loc of data.locations ?? []) {
        const addr = loc.storefrontAddress;
        const address = addr
          ? [addr.addressLines?.join(" "), addr.locality, addr.administrativeArea]
              .filter(Boolean)
              .join(", ")
          : null;
        locations.push({
          name: loc.name,
          title: loc.title ?? loc.name,
          address: address || null,
          phone: loc.phoneNumbers?.primaryPhone ?? null,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  return locations;
}

// ---------------------------------------------------------------------------
// Performance metrics (raw daily fetch)
// ---------------------------------------------------------------------------

interface MultiTimeSeriesResponse {
  multiDailyMetricTimeSeries?: {
    dailyMetricTimeSeries?: {
      dailyMetric?: string;
      timeSeries?: {
        datedValues?: {
          date?: { year: number; month: number; day: number };
          value?: string;
        }[];
      };
    };
  }[];
}

/**
 * Fetches per-day values for every metric in DAILY_METRICS between two dates.
 * Returns a map of `metric -> (YYYY-MM-DD -> value)`.
 */
async function fetchDailyMetrics(
  accessToken: string,
  location: string,
  start: Date,
  end: Date
): Promise<Map<DailyMetric, Map<string, number>>> {
  const url = new URL(
    `${PERF_API}/${location}:fetchMultiDailyMetricsTimeSeries`
  );
  for (const metric of DAILY_METRICS) {
    url.searchParams.append("dailyMetrics", metric);
  }
  url.searchParams.set("dailyRange.start_date.year", String(start.getUTCFullYear()));
  url.searchParams.set("dailyRange.start_date.month", String(start.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.start_date.day", String(start.getUTCDate()));
  url.searchParams.set("dailyRange.end_date.year", String(end.getUTCFullYear()));
  url.searchParams.set("dailyRange.end_date.month", String(end.getUTCMonth() + 1));
  url.searchParams.set("dailyRange.end_date.day", String(end.getUTCDate()));

  const data = await gbpFetch<MultiTimeSeriesResponse>(url.toString(), accessToken);

  const result = new Map<DailyMetric, Map<string, number>>();
  for (const metric of DAILY_METRICS) result.set(metric, new Map());

  for (const entry of data.multiDailyMetricTimeSeries ?? []) {
    const series = entry.dailyMetricTimeSeries;
    const metric = series?.dailyMetric as DailyMetric | undefined;
    if (!metric || !result.has(metric)) continue;
    const bucket = result.get(metric)!;
    for (const dv of series?.timeSeries?.datedValues ?? []) {
      if (!dv.date) continue;
      const key = `${dv.date.year}-${String(dv.date.month).padStart(2, "0")}-${String(
        dv.date.day
      ).padStart(2, "0")}`;
      bucket.set(key, Number(dv.value ?? 0));
    }
  }

  return result;
}

/**
 * Fetches raw daily metrics for a location over a date range, returned as one
 * row per day for persistence.
 */
export async function fetchGBPRawDaily(
  userId: string,
  location: string,
  start: Date,
  end: Date
): Promise<GBPRawDaily[]> {
  const accessToken = await getAccessToken(userId);
  const metrics = await fetchDailyMetrics(accessToken, location, start, end);
  const get = (m: DailyMetric, day: string) => metrics.get(m)?.get(day) ?? 0;

  const rows: GBPRawDaily[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = toDateKey(d);
    rows.push({
      date: day,
      desktopMaps: get("BUSINESS_IMPRESSIONS_DESKTOP_MAPS", day),
      desktopSearch: get("BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", day),
      mobileMaps: get("BUSINESS_IMPRESSIONS_MOBILE_MAPS", day),
      mobileSearch: get("BUSINESS_IMPRESSIONS_MOBILE_SEARCH", day),
      websiteClicks: get("WEBSITE_CLICKS", day),
      callClicks: get("CALL_CLICKS", day),
      directionRequests: get("BUSINESS_DIRECTION_REQUESTS", day),
      conversations: get("BUSINESS_CONVERSATIONS", day),
      bookings: get("BUSINESS_BOOKINGS", day),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function sumTotals(points: GBPDailyPoint[]): GBPTotals {
  return points.reduce((acc, p) => {
    acc.views += p.views;
    acc.searches += p.searches;
    acc.websiteClicks += p.websiteClicks;
    acc.directions += p.directions;
    acc.calls += p.calls;
    acc.interactions += p.interactions;
    return acc;
  }, emptyTotals());
}

function buildMonthly(points: GBPDailyPoint[]): GBPMonthlyRow[] {
  const byMonth = new Map<string, GBPMonthlyRow>();
  for (const p of points) {
    const month = p.date.slice(0, 7);
    const row =
      byMonth.get(month) ??
      ({
        month,
        label: monthLabel(month),
        views: 0,
        searches: 0,
        websiteClicks: 0,
        directions: 0,
        calls: 0,
        interactions: 0,
      } satisfies GBPMonthlyRow);
    row.views += p.views;
    row.searches += p.searches;
    row.websiteClicks += p.websiteClicks;
    row.directions += p.directions;
    row.calls += p.calls;
    row.interactions += p.interactions;
    byMonth.set(month, row);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// ---------------------------------------------------------------------------
// Search keywords (monthly)
// ---------------------------------------------------------------------------

interface SearchKeywordsResponse {
  searchKeywordsCounts?: {
    searchKeyword?: string;
    insightsValue?: { value?: string; threshold?: string };
  }[];
}

async function fetchSearchKeywords(
  accessToken: string,
  location: string,
  start: Date,
  end: Date
): Promise<GBPSearchKeyword[]> {
  const url = new URL(`${PERF_API}/${location}/searchkeywords/impressions/monthly`);
  url.searchParams.set("monthlyRange.start_month.year", String(start.getUTCFullYear()));
  url.searchParams.set("monthlyRange.start_month.month", String(start.getUTCMonth() + 1));
  url.searchParams.set("monthlyRange.end_month.year", String(end.getUTCFullYear()));
  url.searchParams.set("monthlyRange.end_month.month", String(end.getUTCMonth() + 1));

  const data = await gbpFetch<SearchKeywordsResponse>(url.toString(), accessToken);

  const aggregated = new Map<string, { impressions: number; approximate: boolean }>();
  for (const row of data.searchKeywordsCounts ?? []) {
    const keyword = row.searchKeyword?.trim();
    if (!keyword) continue;
    const exact = row.insightsValue?.value;
    const threshold = row.insightsValue?.threshold;
    const impressions = Number(exact ?? threshold ?? 0);
    const existing = aggregated.get(keyword) ?? { impressions: 0, approximate: false };
    existing.impressions += impressions;
    existing.approximate = existing.approximate || exact == null;
    aggregated.set(keyword, existing);
  }

  return [...aggregated.entries()]
    .map(([keyword, v]) => ({ keyword, ...v }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reviews (best-effort; legacy v4 endpoint)
// ---------------------------------------------------------------------------

interface ReviewsResponse {
  reviews?: { starRating?: string }[];
  averageRating?: number;
  totalReviewCount?: number;
}

const STAR_MAP: Record<string, 1 | 2 | 3 | 4 | 5> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

async function fetchReviews(
  accessToken: string,
  accounts: { name: string }[],
  location: string
): Promise<GBPReviews | null> {
  const locationId = location.split("/").pop();
  if (!locationId) return null;

  for (const account of accounts) {
    try {
      const url = `${LEGACY_API}/${account.name}/locations/${locationId}/reviews?pageSize=50`;
      const data = await gbpFetch<ReviewsResponse>(url, accessToken);
      const reviews = data.reviews ?? [];
      const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      };
      for (const r of reviews) {
        const star = r.starRating ? STAR_MAP[r.starRating] : undefined;
        if (star) distribution[star] += 1;
      }
      return {
        averageRating: data.averageRating ?? 0,
        totalReviews: data.totalReviewCount ?? reviews.length,
        distribution,
      };
    } catch {
      // Try the next account; reviews are optional.
    }
  }
  return null;
}

/**
 * Fetches the supplementary data (top search queries + reviews) that is not
 * stored in the daily metrics table. Best-effort: failures degrade to
 * empty/null rather than throwing.
 */
export async function fetchGBPSupplemental(
  userId: string,
  location: string,
  start: Date,
  end: Date
): Promise<GBPSupplemental> {
  const accessToken = await getAccessToken(userId);

  const searchKeywords = await fetchSearchKeywords(accessToken, location, start, end).catch(
    () => []
  );

  let reviews: GBPReviews | null = null;
  try {
    const accountsData = await gbpFetch<AccountsResponse>(
      `${ACCOUNTS_API}/accounts`,
      accessToken
    );
    reviews = await fetchReviews(accessToken, accountsData.accounts ?? [], location);
  } catch {
    reviews = null;
  }

  return { searchKeywords, reviews };
}

// ---------------------------------------------------------------------------
// Report builder (pure — operates on stored rows)
// ---------------------------------------------------------------------------

/**
 * Builds a full GBP progress report from raw daily rows. `currentRows` covers
 * the reporting window; `previousRows` covers the immediately-prior window used
 * for delta comparisons.
 */
export function buildGBPReport(params: {
  location: string;
  days: number;
  startDate: string;
  endDate: string;
  currentRows: GBPRawDaily[];
  previousRows: GBPRawDaily[];
  supplemental: GBPSupplemental;
}): GBPReport {
  const { location, days, startDate, endDate, currentRows, previousRows, supplemental } =
    params;

  const daily = currentRows.map(rawToDailyPoint);
  const totals = sumTotals(daily);
  const previousTotals = sumTotals(previousRows.map(rawToDailyPoint));

  const deltas: GBPTotals = {
    views: pctChange(totals.views, previousTotals.views),
    searches: pctChange(totals.searches, previousTotals.searches),
    websiteClicks: pctChange(totals.websiteClicks, previousTotals.websiteClicks),
    directions: pctChange(totals.directions, previousTotals.directions),
    calls: pctChange(totals.calls, previousTotals.calls),
    interactions: pctChange(totals.interactions, previousTotals.interactions),
  };

  const sumRaw = (pick: (r: GBPRawDaily) => number) =>
    currentRows.reduce((a, r) => a + pick(r), 0);

  const findYou: GBPBreakdownSlice[] = [
    { label: "Mobile search", value: sumRaw((r) => r.mobileSearch) },
    { label: "Desktop search", value: sumRaw((r) => r.desktopSearch) },
    { label: "Maps", value: sumRaw((r) => r.mobileMaps + r.desktopMaps) },
  ].filter((s) => s.value > 0);

  const actions: GBPBreakdownSlice[] = [
    { label: "Phone calls", value: totals.calls },
    { label: "Website clicks", value: totals.websiteClicks },
    { label: "Direction requests", value: totals.directions },
    { label: "Messages", value: sumRaw((r) => r.conversations) },
    { label: "Bookings", value: sumRaw((r) => r.bookings) },
  ].filter((s) => s.value > 0);

  return {
    location,
    periodDays: days,
    startDate,
    endDate,
    totals,
    previousTotals,
    deltas,
    daily,
    monthly: buildMonthly(daily),
    findYou,
    actions,
    searchKeywords: supplemental.searchKeywords,
    reviews: supplemental.reviews,
  };
}

/** The latest date the Performance API reliably has data for (~3 days ago). */
export function gbpLatestDataDate(): Date {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  end.setUTCHours(0, 0, 0, 0);
  return end;
}

/**
 * Builds a report by fetching everything live from the API. Used as a fallback
 * when no stored rows exist yet.
 */
export async function getGBPReport(
  userId: string,
  location: string,
  days: number
): Promise<GBPReport> {
  const end = gbpLatestDataDate();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));

  const [rows, supplemental] = await Promise.all([
    fetchGBPRawDaily(userId, location, prevStart, end),
    fetchGBPSupplemental(userId, location, start, end),
  ]);

  const startKey = toDateKey(start);
  const currentRows = rows.filter((r) => r.date >= startKey);
  const previousRows = rows.filter((r) => r.date < startKey);

  return buildGBPReport({
    location,
    days,
    startDate: startKey,
    endDate: toDateKey(end),
    currentRows,
    previousRows,
    supplemental,
  });
}
