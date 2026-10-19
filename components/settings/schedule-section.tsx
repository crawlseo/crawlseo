"use client";

import { useId, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SCHEDULE_DAY_CHOICES, type ScheduleView } from "@/lib/schedule-settings";

const SELECT_CLASS =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-brand-500 focus:bg-bg focus:outline-none disabled:opacity-60 sm:w-64";

/** How an interval reads in the list. */
export function intervalLabel(days: number): string {
  if (days === 0) return "Off";
  if (days === 1) return "Every day";
  if (days === 7) return "Every week";
  if (days % 7 === 0) return `Every ${days / 7} weeks`;
  return `Every ${days} days`;
}

type Kind = "crawl" | "vitals";

const KINDS: { kind: Kind; label: string; description: string; env: string }[] = [
  {
    kind: "crawl",
    label: "Crawl",
    description: "A crawl of each of your sites, with the page count of its last crawl.",
    env: "SCHEDULE_CRAWL_DAYS",
  },
  {
    kind: "vitals",
    label: "Vitals check",
    description: "A Core Web Vitals check of each of your sites. Each check uses PageSpeed Insights quota.",
    env: "SCHEDULE_VITALS_DAYS",
  },
];

/**
 * Settings > Schedule: how often the user's sites are crawled and checked.
 * "default" keeps the server's interval; the server can also turn a kind off
 * for everyone, then the list is disabled and says so.
 */
export function ScheduleSection({ initial }: { initial: ScheduleView }) {
  const id = useId();
  const [view, setView] = useState(initial);
  const [values, setValues] = useState<Record<Kind, string>>({
    crawl: initial.crawlDays === null ? "default" : String(initial.crawlDays),
    vitals: initial.vitalsDays === null ? "default" : String(initial.vitalsDays),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const { server } = view;

  const defaults: Record<Kind, number> = { crawl: server.crawlDefaultDays, vitals: server.vitalsDefaultDays };
  const stored: Record<Kind, number | null> = { crawl: view.crawlDays, vitals: view.vitalsDays };
  const changed = KINDS.some(({ kind }) => values[kind] !== (stored[kind] === null ? "default" : String(stored[kind])));

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const days = (v: string) => (v === "default" ? null : Number(v));
    try {
      const res = await fetch("/api/user/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crawlDays: days(values.crawl), vitalsDays: days(values.vitals) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The schedule could not be saved.");
      setView(data as ScheduleView);
      setMessage({ ok: true, text: "Schedule saved. It applies from the next scheduling pass, within 10 minutes." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "The schedule could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="panel p-5">
      <div className="flex items-start gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-soft text-text-strong">
          <CalendarClock className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-5">
          {!server.schedulerEnabled && (
            <p className="text-[13px] leading-5 text-text">
              The schedule is turned off on this server (<code className="font-data">SCHEDULER_ENABLED=false</code>).
              Crawls and vitals checks run only when you start them.
            </p>
          )}
          {server.serverless && (
            <p className="text-[13px] leading-5 text-text">
              This instance runs on a serverless host. Scheduled crawls and vitals checks run only on Docker
              installs, or when a worker is connected to this database.
            </p>
          )}
          {KINDS.map(({ kind, label, description, env }) => {
            const serverOff = !server.schedulerEnabled || defaults[kind] === 0;
            const choices = [...new Set<number>([...SCHEDULE_DAY_CHOICES, ...(stored[kind] !== null ? [stored[kind]!] : [])])].sort(
              (a, b) => a - b
            );
            return (
              <div key={kind}>
                <label htmlFor={`${id}-${kind}`} className="block text-[15px] leading-5 font-medium text-text-strong">
                  {label}
                </label>
                <p id={`${id}-${kind}-help`} className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  {description}
                  {serverOff && defaults[kind] === 0 && server.schedulerEnabled && (
                    <>
                      {" "}
                      Turned off on this server (<code className="font-data">{env}=0</code>).
                    </>
                  )}
                </p>
                <select
                  id={`${id}-${kind}`}
                  name={kind}
                  value={values[kind]}
                  disabled={serverOff}
                  aria-describedby={`${id}-${kind}-help`}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [kind]: e.target.value }));
                    setMessage(null);
                  }}
                  className={`mt-2 ${SELECT_CLASS}`}
                >
                  <option value="default">
                    Server default ({serverOff ? "off" : intervalLabel(defaults[kind]).toLowerCase()})
                  </option>
                  {choices.map((d) => (
                    <option key={d} value={String(d)}>
                      {intervalLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          {message && (
            <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-success" : "text-xs text-danger"}>
              {message.text}
            </p>
          )}
          <Button type="submit" size="sm" disabled={saving || !changed}>
            {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Save schedule
          </Button>
        </div>
      </div>
    </form>
  );
}
