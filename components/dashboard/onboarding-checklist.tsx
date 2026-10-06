"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Globe,
  Link2,
  RefreshCw,
  Bug,
  Check,
  ChevronRight,
  X,
} from "lucide-react";

type Step = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  done: boolean;
  href: string;
  actionLabel: string;
};

interface OnboardingChecklistProps {
  hasSites: boolean;
  hasGscConnected: boolean;
  hasSyncedData: boolean;
  hasCrawled: boolean;
  firstSiteId?: string;
}

export function OnboardingChecklist({
  hasSites,
  hasGscConnected,
  hasSyncedData,
  hasCrawled,
  firstSiteId,
}: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(false);

  const allDone = hasSites && hasGscConnected && hasSyncedData && hasCrawled;
  if (allDone || dismissed) return null;

  const steps: Step[] = [
    {
      id: "add-site",
      label: "Add a site",
      description: "Connect a Google Search Console property to monitor",
      icon: <Globe className="size-4" />,
      done: hasSites,
      href: "/sites",
      actionLabel: "Add site",
    },
    {
      id: "connect-gsc",
      label: "Connect GSC",
      description: "Link your Google Search Console for keyword and page data",
      icon: <Link2 className="size-4" />,
      done: hasGscConnected,
      href: firstSiteId ? `/sites/${firstSiteId}` : "/sites",
      actionLabel: "Connect",
    },
    {
      id: "first-sync",
      label: "Sync GSC data",
      description: "Pull the last 28 days of search performance data",
      icon: <RefreshCw className="size-4" />,
      done: hasSyncedData,
      href: firstSiteId ? `/sites/${firstSiteId}` : "/sites",
      actionLabel: "Sync now",
    },
    {
      id: "first-crawl",
      label: "Run first crawl",
      description: "Audit your site for technical SEO issues",
      icon: <Bug className="size-4" />,
      done: hasCrawled,
      href: firstSiteId ? `/sites/${firstSiteId}/crawl` : "/sites",
      actionLabel: "Start crawl",
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div className="panel relative mb-6 overflow-hidden">

      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <h2 className="text-[15px] leading-5 font-semibold">
            Get started
          </h2>
          <p className="mono-label mt-1 text-[11px] text-muted-foreground">
            {completedCount}/{steps.length} steps completed
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-bg-section hover:text-text-strong"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="mx-5 mt-3 h-0.5 overflow-hidden bg-bg-section">
        <div
          className="h-full bg-brand-500 transition-all duration-300"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>

      <div className="divide-y divide-border-soft px-2 pb-2 pt-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              "flex items-center gap-4 rounded-md px-3 py-3 transition-colors",
              !step.done && "hover:bg-bg-soft"
            )}
          >
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md border",
                step.done
                  ? "border-success/30 bg-success-bg text-success"
                  : "border-border bg-bg-soft text-text-strong"
              )}
            >
              {step.done ? <Check className="size-4" /> : step.icon}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[14px] font-medium",
                  step.done
                    ? "text-muted-foreground line-through"
                    : "text-text-strong"
                )}
              >
                {step.label}
              </p>
              <p className="text-[13px] leading-5 text-muted-foreground">{step.description}</p>
            </div>

            {!step.done && (
              <Link
                href={step.href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {step.actionLabel}
                <ChevronRight className="size-3" aria-hidden />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
