import { cn } from "@/lib/utils";
import { HeaderStatus } from "@/components/ui/header-status";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 sm:mb-8", className)}>
      <HeaderStatus>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-1 text-atom-caption font-semibold uppercase tracking-[0.12em] text-primary">
                {eyebrow}
              </p>
            )}
            <h1 className="font-heading text-atom-heading font-semibold tracking-tight text-foreground sm:text-atom-display1 sm:leading-[48px]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 max-w-2xl text-atom-body text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
      </HeaderStatus>
    </div>
  );
}
