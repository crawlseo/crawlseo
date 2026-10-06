"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertTriangle } from "lucide-react";
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
  const [reauthRequired, setReauthRequired] = useState(false);

  const handleSync = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);
    setMessage(null);
    setError(false);
    setReauthRequired(false);

    try {
      const response = await fetch("/api/gsc/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });

      const data = await response.json();

      if (response.status === 401 && data.code === "REAUTH_REQUIRED") {
        setReauthRequired(true);
        return;
      }

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
        className={cn(fullWidth && "w-full", className)}
      >
        {loading ? "Syncing…" : "Sync GSC"}
      </Button>
      {reauthRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-bg p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="text-muted-foreground">
              Your Google connection expired.{" "}
              <button
                onClick={() => signIn("google")}
                className="text-link font-medium"
              >
                Reconnect &rarr;
              </button>
            </p>
          </div>
        </div>
      )}
      {message && (
        <p
          className={cn(
            "text-atom-caption",
            error ? "text-danger" : "text-success",
            fullWidth && "text-center"
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
