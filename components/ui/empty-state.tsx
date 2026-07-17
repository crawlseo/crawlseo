import Link from "next/link";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon = "◎",
  className,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: string;
  className?: string;
}) {
  return (
    <div className={cn("panel px-6 py-14 text-center", className)}>
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-signal/20 bg-signal-muted font-mono text-lg text-signal">
        {icon}
      </div>
      <h3 className="font-heading text-lg font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
