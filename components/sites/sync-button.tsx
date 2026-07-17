"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncButton({
  siteId,
  className,
  fullWidth = false,
}: {
  siteId: string;
  className?: string;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    setMessage(null);
    setError(false);

    try {
      const response = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(true);
        setMessage(data.error || "Sync failed");
        return;
      }

      setMessage(
        `Synced ${data.keywordsInserted ?? 0} keywords · ${data.pagesInserted ?? 0} pages`
      );
      router.refresh();
      setTimeout(() => setMessage(null), 4000);
    } catch {
      setError(true);
      setMessage("Sync failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(fullWidth && "w-full", "space-y-2")}>
      <Button
        onClick={handleSync}
        disabled={loading}
        className={cn(
          "bg-primary text-primary-foreground hover:brightness-110",
          fullWidth && "w-full",
          className
        )}
        size="sm"
      >
        {loading ? "Syncing…" : "Sync GSC"}
      </Button>
      {message && (
        <p
          className={cn(
            "text-xs",
            error ? "text-danger" : "text-signal",
            fullWidth && "text-center"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
