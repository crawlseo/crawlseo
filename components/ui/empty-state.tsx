import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

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
      <div
        aria-hidden
        className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-bg-soft text-lg text-text-strong"
      >
        {icon}
      </div>
      <h3 className="text-atom-subheader font-medium text-text-strong">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-atom-body text-muted-foreground">{description}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={cn(buttonVariants(), "mt-6")}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
