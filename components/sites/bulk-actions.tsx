"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  BULK_ACTIONS,
  buildTasks,
  completedTasks,
  isActiveJob,
  type BulkAction,
  type BulkJobView,
  type BulkOptions,
  type BulkSite,
  type BulkTask,
} from "@/lib/bulk/types";

const actionLabels: Record<BulkAction, string> = {
  gsc: "GSC sync",
  bing: "Bing sync",
  crawl: "Crawl / Audit",
  vitals: "PageSpeed",
};
const actionDescriptions: Record<BulkAction, string> = {
  gsc: "Refresh search performance for connected properties.",
  bing: "Refresh Bing traffic, queries and crawl statistics.",
  crawl: "Check your websites for technical SEO issues.",
  vitals: "Check mobile performance on your top pages.",
};
const statusLabels: Record<BulkTask["status"], string> = {
  pending: "Waiting",
  running: "Running",
  completed: "Completed",
  partial: "Partial result",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
};
const BulkContext = createContext<{
  open: () => void;
  job: BulkJobView | null;
  hasSites: boolean;
} | null>(null);

export function BulkActionsButton() {
  const context = useContext(BulkContext);
  const t = useT();
  if (!context?.hasSites) return null;
  const active = context.job && isActiveJob(context.job.status);
  return (
    <Button variant="outline" onClick={context.open}>
      {active ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCw className="size-4" aria-hidden />
      )}
      {active
        ? t("Updating {done}/{total}", {
            done: completedTasks(context.job!.tasks),
            total: context.job!.tasks.length,
          })
        : t("Bulk actions")}
    </Button>
  );
}

export function BulkActionsProvider({
  sites,
  children,
}: {
  sites: BulkSite[];
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [job, setJob] = useState<BulkJobView | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const previousStatus = useRef<string | null>(null);
  const active = !!job && isActiveJob(job.status);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch("/api/user/bulk-jobs", {
        cache: "no-store",
        signal,
      });
      if (!response.ok)
        throw new Error("Unable to load batch progress. Please try again.");
      const data = (await response.json()) as { job: BulkJobView | null };
      if (signal?.aborted) return;
      if (
        previousStatus.current &&
        isActiveJob(previousStatus.current) &&
        data.job &&
        !isActiveJob(data.job.status)
      )
        router.refresh();
      previousStatus.current = data.job?.status ?? null;
      setJob(data.job);
      return data.job;
    },
    [router],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await load(controller.signal);
        setError("");
      } catch {
        if (!controller.signal.aborted)
          setError("Unable to load batch progress. Please try again.");
      } finally {
        busy = false;
      }
    }, 3_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [active, load]);

  async function start(
    siteIds: string[],
    actions: BulkAction[],
    options: BulkOptions,
  ) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/user/bulk-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteIds, actions, ...options }),
      });
      const data = await response.json();
      if (!response.ok && response.status !== 409)
        throw new Error(
          data.error || "Unable to start batch. Please try again.",
        );
      if (!data.job)
        throw new Error("Unable to start batch. Please try again.");
      previousStatus.current = data.job.status;
      setJob(data.job);
      if (response.status === 409) setError("A batch is already running");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start batch. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancel() {
    if (!job || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/user/bulk-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      });
      if (!response.ok) throw new Error();
      await load();
    } catch {
      setError("Unable to stop the queue. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BulkContext.Provider
      value={{
        open: () => {
          setOpen(true);
          setError("");
        },
        job,
        hasSites: sites.length > 0,
      }}
    >
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t(job ? "Batch progress" : "Update your websites")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Run actions for all websites or a selection. Work continues in the background when you close this window.",
              )}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-bg p-3 text-danger"
            >
              {t.stored(error)}
            </p>
          )}
          {job ? (
            <>
              <BulkResults job={job} onNavigate={() => setOpen(false)} />
              <div className="flex flex-wrap justify-end gap-2">
                {active ? (
                  <Button
                    variant="outline"
                    disabled={saving || job.cancelRequested}
                    onClick={() => void cancel()}
                  >
                    {t(
                      job.cancelRequested
                        ? "Stopping after the current step…"
                        : "Stop queue",
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setJob(null);
                      setError("");
                    }}
                  >
                    {t("New batch")}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  {t("Close")}
                </Button>
              </div>
              {active && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Stopping the queue skips pending steps. The current sync or crawl is allowed to finish.",
                  )}
                </p>
              )}
            </>
          ) : (
            <BulkForm sites={sites} saving={saving} start={start} />
          )}
        </DialogContent>
      </Dialog>
    </BulkContext.Provider>
  );
}

function BulkForm({
  sites,
  saving,
  start,
}: {
  sites: BulkSite[];
  saving: boolean;
  start: (
    ids: string[],
    actions: BulkAction[],
    options: BulkOptions,
  ) => Promise<void>;
}) {
  const t = useT();
  const [actions, setActions] = useState<BulkAction[]>(["gsc"]);
  const [selected, setSelected] = useState(() => sites.map((site) => site.id));
  const [maxPages, setMaxPages] = useState(200);
  const [vitalsLimit, setVitalsLimit] = useState(5);
  const tasks = buildTasks(
    sites.filter((site) => selected.includes(site.id)),
    actions,
  );
  const eligible = tasks.filter((task) => task.status === "pending").length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void start(selected, actions, { maxPages, vitalsLimit });
      }}
    >
      <fieldset disabled={saving} className="space-y-5">
        <legend className="sr-only">{t("Batch options")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {BULK_ACTIONS.map((action) => (
            <label
              key={action}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3",
                actions.includes(action)
                  ? "border-ring bg-bg-section"
                  : "border-border",
              )}
            >
              <input
                className="mt-1 size-4 shrink-0 accent-primary"
                type="checkbox"
                checked={actions.includes(action)}
                onChange={(event) =>
                  setActions(
                    event.target.checked
                      ? [...actions, action]
                      : actions.filter((value) => value !== action),
                  )
                }
              />
              <span>
                <span className="block font-medium text-text-strong">
                  {t(actionLabels[action])}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t(actionDescriptions[action])}
                </span>
              </span>
            </label>
          ))}
        </div>
        {(actions.includes("crawl") || actions.includes("vitals")) && (
          <div className="flex flex-wrap gap-4 rounded-lg border bg-bg-soft p-3">
            {actions.includes("crawl") && (
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                {t("Crawl pages per website")}
                <select
                  className="h-9 rounded-md border bg-bg px-2"
                  value={maxPages}
                  onChange={(event) => setMaxPages(Number(event.target.value))}
                >
                  {[25, 50, 100, 200, 500, 1000, 2000].map((value) => (
                    <option key={value} value={value}>
                      {t("counts.pages", { count: value })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {actions.includes("vitals") && (
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                {t("PageSpeed pages per website")}
                <select
                  className="h-9 rounded-md border bg-bg px-2"
                  value={vitalsLimit}
                  onChange={(event) =>
                    setVitalsLimit(Number(event.target.value))
                  }
                >
                  {[1, 3, 5].map((value) => (
                    <option key={value} value={value}>
                      {t("counts.pages", { count: value })}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="rounded-lg border p-3">
          <label className="flex cursor-pointer items-center gap-3 font-medium">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.length === sites.length}
              onChange={(event) =>
                setSelected(
                  event.target.checked ? sites.map((site) => site.id) : [],
                )
              }
            />
            {t("All websites ({count})", { count: sites.length })}
          </label>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              {t("Choose websites ({count} selected)", {
                count: selected.length,
              })}
            </summary>
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className="flex cursor-pointer items-center gap-3"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={selected.includes(site.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, site.id]
                          : selected.filter((id) => id !== site.id),
                      )
                    }
                  />
                  <span className="min-w-0 break-all text-sm">
                    {site.domain}
                  </span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Websites are processed one at a time. Missing connections and crawls already in progress are skipped. PageSpeed uses your API quota.",
          )}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {t("{sites} websites · {steps} steps", {
              sites: selected.length,
              steps: eligible,
            })}
          </p>
          <Button type="submit" disabled={saving || eligible === 0}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {t("Start batch")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

function BulkResults({
  job,
  onNavigate,
}: {
  job: BulkJobView;
  onNavigate: () => void;
}) {
  const t = useT();
  const done = completedTasks(job.tasks);
  const active = isActiveJob(job.status);
  const failures = job.tasks.filter(
    (task) => task.status === "failed" || task.status === "partial",
  ).length;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-bg-soft p-3">
        <p role="status" className="font-medium text-text-strong">
          {t(
            active
              ? "Batch running"
              : job.status === "CANCELLED"
                ? "Batch stopped"
                : job.status === "FAILED"
                  ? "Batch interrupted"
                  : "Batch finished",
          )}
        </p>
        <progress
          aria-label={t("Batch progress")}
          className="mt-2 h-2 w-full accent-primary"
          max={Math.max(1, job.tasks.length)}
          value={done}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {t("{done}/{total} steps finished · {errors} with errors", {
            done,
            total: job.tasks.length,
            errors: failures,
          })}
        </p>
      </div>
      <ol className="max-h-[40dvh] divide-y divide-border overflow-y-auto rounded-lg border">
        {job.tasks.map((task) => (
          <li
            key={`${task.siteId}-${task.action}`}
            className="flex items-start gap-3 p-3"
          >
            {task.status === "running" ? (
              <Loader2
                aria-hidden
                className="mt-1 size-4 shrink-0 animate-spin"
              />
            ) : task.status === "failed" || task.status === "partial" ? (
              <TriangleAlert
                aria-hidden
                className="mt-1 size-4 shrink-0 text-warning"
              />
            ) : task.status === "completed" ? (
              <CheckCircle2
                aria-hidden
                className="mt-1 size-4 shrink-0 text-success"
              />
            ) : (
              <Circle
                aria-hidden
                className="mt-1 size-4 shrink-0 text-muted-foreground"
              />
            )}
            <div className="min-w-0 flex-1">
              <Link
                className="text-link break-all font-medium"
                onClick={onNavigate}
                href={`/sites/${task.siteId}${task.action === "crawl" ? "/crawl" : task.action === "vitals" ? "/vitals" : ""}`}
              >
                {task.domain}
              </Link>
              <p className="text-xs text-muted-foreground">
                {t(actionLabels[task.action])} · {t(statusLabels[task.status])}
              </p>
              {task.message && (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {t(task.message, task.values)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {job.tasks.some(
        (task) =>
          task.message === "Reconnect your Google account before syncing GSC.",
      ) && (
        <Button variant="outline" onClick={() => void signIn("google")}>
          {t("Reconnect Google")}
        </Button>
      )}
      <Link
        className="text-link text-xs"
        href="/settings#api-keys"
        onClick={onNavigate}
      >
        {t("Manage API keys")}
      </Link>
    </div>
  );
}
