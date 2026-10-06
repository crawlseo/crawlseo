"use client";

import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

interface CsvExportButtonProps {
  siteId: string;
  type: "keywords" | "pages";
  label?: string;
}

export function CsvExportButton({ siteId, type, label }: CsvExportButtonProps) {
  return (
    <a
      href={`/api/sites/${siteId}/export?type=${type}`}
      download
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <Download className="size-3.5" aria-hidden />
      {label ?? `Export ${type} CSV`}
    </a>
  );
}
