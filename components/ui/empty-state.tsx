import Link from "next/link";
import { CircleDot, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Static files in public/illustrations/empty/; kept out of the JS bundle on purpose. */
export const EMPTY_ILLUSTRATION_DIR = "/illustrations/empty";

/** A bare name ("empty-sites" or "empty-sites.svg") resolves to the illustration folder; a path starting with "/" is used as is. */
export function illustrationSrc(illustration: string): string {
  if (illustration.startsWith("/")) return illustration;
  return `${EMPTY_ILLUSTRATION_DIR}/${illustration.replace(/\.svg$/, "")}.svg`;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  action,
  icon: Icon = CircleDot,
  illustration,
  className,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  /** A control in place of the link, such as a button that opens a dialog. */
  action?: React.ReactNode;
  icon?: LucideIcon;
  /** Illustration file name or path; replaces the icon when set. */
  illustration?: string;
  className?: string;
}) {
  return (
    <div className={cn("panel px-6 py-14 text-center", className)}>
      {illustration ? (
        // A plain <img>: a decorative static SVG needs no next/image optimisation.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={illustrationSrc(illustration)}
          alt=""
          aria-hidden
          width={160}
          height={116}
          loading="lazy"
          decoding="async"
          className="mx-auto mb-4 h-[116px] w-40"
        />
      ) : (
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-border bg-bg-soft text-text-strong">
          <Icon className="size-5" aria-hidden />
        </div>
      )}
      <h3 className="text-atom-subheader font-medium text-text-strong">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-atom-body text-muted-foreground">{description}</p>
      {action ? (
        <div className="mt-6 flex justify-center">{action}</div>
      ) : actionLabel && actionHref && (
        <Link href={actionHref} className={cn(buttonVariants(), "mt-6")}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
