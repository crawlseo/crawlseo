/**
 * Atomize PRO 3.4 tokens (dark-first product UI)
 * @see https://atomizedesign.com/
 */
export const atomize = {
  colors: {
    bg: "#0C0C0E",
    card: "#161618",
    rail: "#0A0A0B",
    border: "rgba(255,255,255,0.07)",
    primary: "#A78BFA",
    primaryHover: "#C4B5FD",
    success: "#34D399",
    warning: "#FBBF24",
    danger: "#F87171",
    info: "#60A5FA",
    text: "#F4F4F5",
    muted: "#A1A1AA",
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
    xl: 18,
    full: 9999,
  },
  containerMaxWidth: 1200,
} as const;
