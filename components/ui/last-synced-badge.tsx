"use client";

import { RefreshCw } from "lucide-react";

function relativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LastSyncedBadge({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  const label = lastSyncedAt
    ? `GSC synced ${relativeTime(new Date(lastSyncedAt))}`
    : "GSC never synced";

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">
      <RefreshCw className="size-3" />
      <span>{label}</span>
    </div>
  );
}
