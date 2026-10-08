export const THEME_COOKIE = "crawlseo-theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && THEMES.some((theme) => theme === value);
}

export function resolveTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
