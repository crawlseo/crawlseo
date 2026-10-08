export const BULK_ACTIONS = ["gsc", "bing", "crawl", "vitals"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export type BulkSite = {
  id: string;
  domain: string;
  gscProperty: string | null;
  bingSite: string | null;
};
export type BulkOptions = { maxPages: number; vitalsLimit: number };
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "partial"
  | "skipped"
  | "failed"
  | "cancelled";
export type BulkTask = {
  siteId: string;
  domain: string;
  action: BulkAction;
  status: TaskStatus;
  message?: string;
  values?: Record<string, string | number>;
  crawlId?: string;
};
export type BulkJobView = {
  id: string;
  status: string;
  tasks: BulkTask[];
  cancelRequested: boolean;
  createdAt: string;
  finishedAt: string | null;
};
export const isActiveJob = (status: string) =>
  status === "QUEUED" || status === "RUNNING";
export const completedTasks = (tasks: BulkTask[]) =>
  tasks.filter((t) => t.status !== "pending" && t.status !== "running").length;

export function buildTasks(
  sites: BulkSite[],
  actions: BulkAction[],
): BulkTask[] {
  return BULK_ACTIONS.filter((action) => actions.includes(action)).flatMap(
    (action) =>
      sites.map((site) => {
        const missing =
          action === "gsc" && !site.gscProperty
            ? "No GSC property connected"
            : action === "bing" && !site.bingSite
              ? "No Bing property connected"
              : undefined;
        return {
          siteId: site.id,
          domain: site.domain,
          action,
          status: missing ? "skipped" : "pending",
          ...(missing && { message: missing }),
        };
      }),
  );
}
