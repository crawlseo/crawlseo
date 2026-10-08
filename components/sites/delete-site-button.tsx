"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useT } from "@/components/i18n/provider";

export function DeleteSiteButton({ siteId, domain }: { siteId: string; domain: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete site");
      router.push("/sites");
      router.refresh();
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="size-3.5" />
        {t("Delete site")}{" "}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <p className="text-sm text-danger">
        {t("Delete")} <strong>{domain}</strong> {t("and all data?")}{" "}
      </p>
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
        {loading ? "Deleting..." : "Yes, delete"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        {t("Cancel")}{" "}
      </Button>
    </div>
  );
}
