"use client";

import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/components/i18n/provider";

interface CsvExportButtonProps {
  siteId: string;
  type: "keywords" | "pages";
  label?: string;
}

export function CsvExportButton({ siteId, type, label }: CsvExportButtonProps) {
  const t = useT();
  return (
    <a
      href={`/api/sites/${siteId}/export?type=${type}`}
      download
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Download className="size-3.5" aria-hidden />
      {label ?? t(type === "keywords" ? "Export keywords CSV" : "Export pages CSV")}
    </a>
  );
}
