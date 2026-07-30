"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Eye,
  Search,
  MousePointerClick,
  Navigation,
  Phone,
  Sparkles,
  Star,
  Loader2,
  MapPin,
  AlertTriangle,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types (mirror lib/google/gbp-client.ts)
// ---------------------------------------------------------------------------

interface Totals {
  views: number;
  searches: number;
  websiteClicks: number;
  directions: number;
  calls: number;
  interactions: number;
}

interface DailyPoint extends Totals {
  date: string;
}

interface MonthlyRow extends Totals {
  month: string;
  label: string;
}

interface Slice {
  label: string;
  value: number;
}

interface SearchKeyword {
  keyword: string;
  impressions: number;
  approximate: boolean;
}

interface Reviews {
  averageRating: number;
  totalReviews: number;
  distribution: Record<string, number>;
}

interface Report {
  label?: string | null;
  periodDays: number;
  startDate: string;
  endDate: string;
  totals: Totals;
  deltas: Totals;
  daily: DailyPoint[];
  monthly: MonthlyRow[];
  findYou: Slice[];
  actions: Slice[];
  searchKeywords: SearchKeyword[];
  reviews: Reviews | null;
}

interface LocationOption {
  name: string;
  title: string;
  address: string | null;
  phone: string | null;
}

// ---------------------------------------------------------------------------
// Formatting + palette
// ---------------------------------------------------------------------------

function fmtCompact(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

/** delta arrives on a 0-1 scale (0.638 => +63.8%). */
function fmtDelta(v: number): string {
  const pct = v * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const PALETTE = ["#A78BFA", "#34D399", "#38BDF8", "#FBBF24", "#F472B6", "#F87171"];
const AXIS = "#71717A";
const GRID = "rgba(255,255,255,0.06)";

const TOOLTIP_STYLE = {
  background: "#161618",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  fontSize: 12,
  boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
  color: "#F4F4F5",
} as const;

const DAY_OPTIONS = [
  { value: 28, label: "28 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "6 months" },
  { value: 365, label: "12 months" },
];

function formatAxisDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const isFlat = !Number.isFinite(delta) || Math.abs(delta) < 0.0005;
  const good = delta > 0;

  return (
    <div className="panel relative p-4 sm:p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 text-primary" />
        <p className="text-atom-caption font-semibold uppercase tracking-[0.1em]">
          {label}
        </p>
      </div>
      <p className="mt-3 font-heading text-atom-display1 font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <div
        className={cn(
          "mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 font-data text-xs font-semibold",
          isFlat && "bg-muted text-muted-foreground",
          !isFlat && good && "bg-signal-muted text-signal",
          !isFlat && !good && "bg-[var(--a-danger-300)] text-[var(--a-danger-900)]"
        )}
      >
        {isFlat ? "—" : fmtDelta(delta)}
      </div>
      <span className="ml-2 text-atom-caption text-muted-foreground">
        vs prior period
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function GBPProgressClient({ siteId }: { siteId: string }) {
  const [days, setDays] = useState(90);
  const [report, setReport] = useState<Report | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/gbp?days=${days}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load report");
      if (json.needsSetup) {
        setNeedsSetup(true);
        setReport(null);
      } else {
        setNeedsSetup(false);
        setReport(json as Report);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [siteId, days]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="panel flex h-72 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-atom-body">Loading Business Profile metrics…</span>
      </div>
    );
  }

  if (needsSetup) {
    return <SetupPanel siteId={siteId} onLinked={load} />;
  }

  if (error) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-2 py-12 text-center">
        <AlertTriangle className="size-6 text-danger" />
        <p className="text-atom-body text-foreground">{error}</p>
        <button
          type="button"
          onClick={load}
          className="mt-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-6">
      {/* Period selector + linked location */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-atom-caption text-muted-foreground">
          <MapPin className="size-4 text-primary" />
          <span className="text-foreground">{report.label ?? "Linked location"}</span>
          <span>·</span>
          <span>
            {report.startDate} → {report.endDate}
          </span>
        </div>
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDays(opt.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                days === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total views" value={fmtCompact(report.totals.views)} delta={report.deltas.views} icon={Eye} />
        <MetricCard label="Searches" value={fmtCompact(report.totals.searches)} delta={report.deltas.searches} icon={Search} />
        <MetricCard label="Website clicks" value={fmtCompact(report.totals.websiteClicks)} delta={report.deltas.websiteClicks} icon={MousePointerClick} />
        <MetricCard label="Directions" value={fmtCompact(report.totals.directions)} delta={report.deltas.directions} icon={Navigation} />
        <MetricCard label="Phone calls" value={fmtCompact(report.totals.calls)} delta={report.deltas.calls} icon={Phone} />
        <MetricCard label="Interactions" value={fmtCompact(report.totals.interactions)} delta={report.deltas.interactions} icon={Sparkles} />
      </div>

      {/* Time series */}
      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChart
          title="Performance over time"
          subtitle="Views, searches & website clicks"
          data={report.daily}
          series={[
            { key: "views", label: "Views", color: PALETTE[0] },
            { key: "searches", label: "Searches", color: PALETTE[1] },
            { key: "websiteClicks", label: "Website clicks", color: PALETTE[2] },
          ]}
        />
        <TrendChart
          title="Actions over time"
          subtitle="Directions, calls & interactions"
          data={report.daily}
          series={[
            { key: "directions", label: "Directions", color: PALETTE[3] },
            { key: "calls", label: "Phone calls", color: PALETTE[1] },
            { key: "interactions", label: "Interactions", color: PALETTE[4] },
          ]}
        />
      </div>

      {/* Find you + actions breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        <FindYouDonut slices={report.findYou} />
        <ActionsBreakdown slices={report.actions} />
      </div>

      {/* Queries + reviews */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SearchKeywords keywords={report.searchKeywords} />
        <ReviewsSummary reviews={report.reviews} />
      </div>

      {/* Monthly snapshot */}
      <MonthlySnapshot rows={report.monthly} totals={report.totals} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup flow
// ---------------------------------------------------------------------------

function SetupPanel({
  siteId,
  onLinked,
}: {
  siteId: string;
  onLinked: () => void;
}) {
  const [locations, setLocations] = useState<LocationOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchLocations() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/gbp/locations`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to list locations");
      setLocations(json.locations as LocationOption[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list locations");
    } finally {
      setLoading(false);
    }
  }

  async function selectLocation(loc: LocationOption) {
    setSaving(loc.name);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/gbp/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: loc.name, label: loc.title }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Failed to link location");
      }
      onLinked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link location");
      setSaving(null);
    }
  }

  return (
    <div className="panel p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/15 p-2">
          <MapPin className="size-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            Link a Google Business Profile
          </h3>
          <p className="mt-1 max-w-xl text-atom-body text-muted-foreground">
            Choose which Business Profile location this site tracks. Metrics are
            pulled from the Business Profile Performance API using your connected
            Google account.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
          <span>{error}</span>
        </div>
      )}

      {locations === null ? (
        <button
          type="button"
          onClick={fetchLocations}
          disabled={loading}
          className="mt-5 flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Find my locations
        </button>
      ) : locations.length === 0 ? (
        <p className="mt-5 text-atom-body text-muted-foreground">
          No Business Profile locations were found on your Google account.
        </p>
      ) : (
        <div className="mt-5 space-y-2">
          {locations.map((loc) => (
            <button
              key={loc.name}
              type="button"
              onClick={() => selectLocation(loc)}
              disabled={saving !== null}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition hover:border-primary/50 hover:bg-muted disabled:opacity-60"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{loc.title}</p>
                {loc.address && (
                  <p className="truncate text-atom-caption text-muted-foreground">
                    {loc.address}
                  </p>
                )}
              </div>
              {saving === loc.name ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Check className="size-4 shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts + panels
// ---------------------------------------------------------------------------

function TrendChart({
  title,
  subtitle,
  data,
  series,
}: {
  title: string;
  subtitle: string;
  data: DailyPoint[];
  series: { key: keyof Totals; label: string; color: string }[];
}) {
  return (
    <div className="panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
            {title}
          </h3>
          <p className="text-atom-caption text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-4 text-atom-caption">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-2 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`gbp-${title}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="4 6" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tick={{ fill: AXIS, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(label) => formatAxisDate(String(label))}
            formatter={(value, name) => [
              typeof value === "number" ? value.toLocaleString() : value,
              String(name),
            ]}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={`url(#gbp-${title}-${s.key})`}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FindYouDonut({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);

  return (
    <div className="panel p-5 sm:p-6">
      <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
        How customers find you
      </h3>
      <p className="mb-4 text-atom-caption text-muted-foreground">
        Profile impressions by surface &amp; device
      </p>

      {total === 0 ? (
        <EmptyBlock label="No impression data for this period" />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ResponsiveContainer width={180} height={180}>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius={54}
                outerRadius={82}
                paddingAngle={2}
                stroke="none"
              >
                {slices.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => (typeof value === "number" ? value.toLocaleString() : value)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2">
            {slices.map((s, i) => (
              <div key={s.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  {s.label}
                </span>
                <span className="font-data font-semibold text-foreground">
                  {Math.round((s.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionsBreakdown({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const max = Math.max(1, ...slices.map((s) => s.value));

  return (
    <div className="panel p-5 sm:p-6">
      <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
        Customer actions breakdown
      </h3>
      <p className="mb-4 text-atom-caption text-muted-foreground">
        Share of total customer interactions
      </p>

      {total === 0 ? (
        <EmptyBlock label="No customer actions for this period" />
      ) : (
        <div className="space-y-3">
          {slices.map((s, i) => (
            <div key={s.label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-data font-semibold text-foreground">
                  {s.value.toLocaleString()}{" "}
                  <span className="text-muted-foreground">
                    ({Math.round((s.value / total) * 100)}%)
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(s.value / max) * 100}%`,
                    background: PALETTE[i % PALETTE.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchKeywords({ keywords }: { keywords: SearchKeyword[] }) {
  return (
    <div className="panel p-5 sm:p-6">
      <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
        Top search queries
      </h3>
      <p className="mb-4 text-atom-caption text-muted-foreground">
        Searches that surfaced your profile
      </p>

      {keywords.length === 0 ? (
        <EmptyBlock label="No search query data for this period" />
      ) : (
        <div className="space-y-1">
          {keywords.map((k, i) => (
            <div
              key={k.keyword}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"
            >
              <span className="inline-flex min-w-0 items-center gap-3">
                <span className="w-4 shrink-0 text-right font-data text-muted-foreground">
                  {i + 1}
                </span>
                <span className="truncate text-foreground">{k.keyword}</span>
              </span>
              <span className="font-data font-semibold text-foreground">
                {k.approximate ? "≈" : ""}
                {k.impressions.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewsSummary({ reviews }: { reviews: Reviews | null }) {
  return (
    <div className="panel p-5 sm:p-6">
      <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
        Customer reviews
      </h3>
      <p className="mb-4 text-atom-caption text-muted-foreground">
        Rating distribution across recent reviews
      </p>

      {!reviews || reviews.totalReviews === 0 ? (
        <EmptyBlock label="Reviews are unavailable for this profile" />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="text-center">
            <p className="font-heading text-atom-display1 font-semibold text-foreground">
              {reviews.averageRating.toFixed(1)}
            </p>
            <div className="mt-1 flex justify-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    "size-4",
                    n <= Math.round(reviews.averageRating)
                      ? "fill-warning text-warning"
                      : "text-muted-foreground/40"
                  )}
                />
              ))}
            </div>
            <p className="mt-1 text-atom-caption text-muted-foreground">
              {reviews.totalReviews.toLocaleString()} reviews
            </p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviews.distribution[String(star)] ?? 0;
              const pct = reviews.totalReviews
                ? (count / reviews.totalReviews) * 100
                : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-muted-foreground">{star}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-warning"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-data text-muted-foreground">
                    {Math.round(pct)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthlySnapshot({ rows, totals }: { rows: MonthlyRow[]; totals: Totals }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border p-5 sm:p-6">
        <h3 className="font-heading text-atom-subheader font-semibold text-foreground">
          Monthly performance snapshot
        </h3>
        <p className="text-atom-caption text-muted-foreground">
          Aggregated metrics per month
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="p-6">
          <EmptyBlock label="No monthly data for this period" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-atom-caption uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-5 py-3 font-semibold">Month</th>
                <th className="px-5 py-3 text-right font-semibold">Views</th>
                <th className="px-5 py-3 text-right font-semibold">Searches</th>
                <th className="px-5 py-3 text-right font-semibold">Clicks</th>
                <th className="px-5 py-3 text-right font-semibold">Directions</th>
                <th className="px-5 py-3 text-right font-semibold">Calls</th>
                <th className="px-5 py-3 text-right font-semibold">Interactions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.month} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="px-5 py-2.5 font-medium text-foreground">{row.label}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.views.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.searches.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.websiteClicks.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.directions.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.calls.toLocaleString()}</td>
                  <td className="px-5 py-2.5 text-right font-data text-foreground">{row.interactions.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/40 font-semibold">
                <td className="px-5 py-3 text-foreground">Total</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.views.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.searches.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.websiteClicks.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.directions.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.calls.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-data text-foreground">{totals.interactions.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function EmptyBlock({ label }: { label: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-center text-atom-body text-muted-foreground">
      {label}
    </div>
  );
}
