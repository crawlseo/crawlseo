"use client";

import { useState } from "react";
import { useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { isLocale, languages, type Locale } from "@/lib/i18n";

export function LanguageSection() {
  const t = useT();
  const [locale, setLocale] = useState<Locale>(t.locale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(false);
    try {
      const response = await fetch("/api/user/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) throw new Error("Unable to save language");
      // Reload server and client content together so no stale language remains.
      window.location.reload();
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <section id="language" className="panel scroll-mt-6 p-5" aria-labelledby="language-title">
      <h3 id="language-title" className="text-[15px] leading-5 font-semibold text-text-strong">
        {t("Language")}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("Choose the interface language for all sites in this browser.")}
      </p>
      <form onSubmit={save} className="mt-4 flex flex-wrap items-end gap-3">
        <label
          className="flex flex-col gap-1 text-sm text-text-strong"
          htmlFor="interface-language"
        >
          {t("Interface language")}
          <select
            id="interface-language"
            value={locale}
            disabled={saving}
            onChange={(event) => {
              if (isLocale(event.target.value)) setLocale(event.target.value);
            }}
            className="h-[38px] min-w-44 rounded-md border border-border bg-bg px-3 text-sm"
          >
            {Object.entries(languages).map(([code, language]) => (
              <option key={code} value={code} lang={code}>
                {language.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={saving || locale === t.locale}>
          {t(saving ? "Saving…" : "Save language")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {t("Unable to save language. Please try again.")}
        </p>
      )}
    </section>
  );
}
