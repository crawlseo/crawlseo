import { cn } from "@/lib/utils";
import { HeaderStatus } from "@/components/ui/header-status";

/**
 * Page top, as on the design boards: H1 26px/500, then either a mono
 * uppercase meta line (dates, counts) or a plain lead, actions on the right.
 */
export function PageHeader({
  title,
  meta,
  description,
  actions,
  className,
}: {
  title: string;
  /** Short facts in mono uppercase, e.g. "Crawl 13 Sep 14:02 · 42 pages". */
  meta?: React.ReactNode;
  /** A sentence of explanation in plain text. */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 sm:mb-[22px]", className)}>
      <HeaderStatus>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="text-[26px] leading-[1.2] font-medium tracking-[-0.03em] break-words text-text-strong">
              {title}
            </h1>
            {meta && (
              <p className="mono-label text-[12px] leading-[18px] text-muted-foreground">{meta}</p>
            )}
            {description && (
              <p className="max-w-[760px] text-[14px] leading-[22px] text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>
          )}
        </div>
      </HeaderStatus>
    </div>
  );
}
