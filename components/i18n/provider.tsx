"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, getTranslator, type Locale } from "@/lib/i18n";
import type { Catalog } from "@/lib/i18n/registry";

const LocaleContext = createContext(getTranslator(DEFAULT_LOCALE));
export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Catalog;
  children: React.ReactNode;
}) {
  const translator = useMemo(() => getTranslator(locale, messages), [locale, messages]);
  return <LocaleContext.Provider value={translator}>{children}</LocaleContext.Provider>;
}
export function useT() {
  return useContext(LocaleContext);
}
