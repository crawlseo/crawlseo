"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/provider";

export function EvaluateAlertsButton() {
  const t = useT();
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
          : t("{0} alert(s): {1}", {
              "0": n,
              "1": data.fires.map((f: { message: string }) => t.stored(f.message)).join(" · "),
            }),
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
        {loading ? t("Checking…") : t("Evaluate now")}
      </Button>
      {msg && <p className="max-w-sm text-xs text-muted-foreground sm:ml-auto">{t.stored(msg)}</p>}
    </div>
  );
}
