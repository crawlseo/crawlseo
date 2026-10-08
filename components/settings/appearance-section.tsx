"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Moon, Sun } from "lucide-react";
import { useT } from "@/components/i18n/provider";
import type { Theme } from "@/lib/appearance";
import { cn } from "@/lib/utils";

const choices = [
  {
    value: "light",
    label: "Light",
    description: "A bright, clear workspace.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Dark surfaces and softer contrast.",
    icon: Moon,
  },
  {
    value: "system",
    label: "System",
    description: "Follow your device's appearance.",
    icon: Monitor,
  },
] as const;

export function AppearanceSection({ initialTheme }: { initialTheme: Theme }) {
  const t = useT();
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  async function selectTheme(next: Theme) {
    if (next === theme || saving) return;
    const previous = theme;
    setTheme(next);
    setSaving(true);
    setStatus(null);
    document.documentElement.dataset.theme = next;
    try {
      const response = await fetch("/api/user/appearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next }),
      });
      if (!response.ok) throw new Error("Unable to save appearance");
      setStatus("saved");
      router.refresh();
    } catch {
      document.documentElement.dataset.theme = previous;
      setTheme(previous);
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="appearance"
      className="panel scroll-mt-6 p-5"
      aria-labelledby="appearance-title"
    >
      <h2 id="appearance-title" className="text-[15px] font-semibold">
        {t("Appearance")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          "Choose how crawlseo looks on this browser. Changes are saved automatically.",
        )}
      </p>
      <fieldset disabled={saving} className="mt-4 grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t("Color theme")}</legend>
        {choices.map(({ value, label, description, icon: Icon }) => (
          <label
            key={value}
            className={cn(
              "flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
              theme === value
                ? "border-ring bg-bg-section"
                : "border-border hover:bg-bg-soft",
              saving && "cursor-wait opacity-70",
            )}
          >
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={theme === value}
              onChange={() => void selectTheme(value)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium text-text-strong">
                <Icon className="size-4" aria-hidden />
                {t(label)}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t(description)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <p
        role={status === "error" ? "alert" : "status"}
        className={cn(
          "mt-3 min-h-5 text-xs",
          status === "error" ? "text-danger" : "text-muted-foreground",
        )}
      >
        {saving
          ? t("Saving…")
          : status === "saved"
            ? t("Appearance saved.")
            : status === "error"
              ? t("Unable to save appearance. Please try again.")
              : t("Your choice applies to all sites in this browser.")}
      </p>
    </section>
  );
}
