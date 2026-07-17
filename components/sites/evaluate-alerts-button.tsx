"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function EvaluateAlertsButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evaluate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const n = data.fires?.length ?? 0;
      setMsg(
        n === 0
          ? "No alerts fired"
          : `${n} alert(s): ${data.fires.map((f: { message: string }) => f.message).join(" · ")}`
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1 text-right">
      <Button size="sm" variant="outline" disabled={loading} onClick={run}>
        {loading ? "Checking…" : "Evaluate now"}
      </Button>
      {msg && (
        <p className="max-w-sm text-xs text-muted-foreground sm:ml-auto">{msg}</p>
      )}
    </div>
  );
}
