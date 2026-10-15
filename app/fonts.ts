import localFont from "next/font/local";

// Inter and Geist Mono, self-hosted so a build needs no network for fonts.
// The files in ./fonts are the subsets Google Fonts serves for Inter v20
// (variable, 100 to 900) and Geist Mono v6 (400 and 500), in Google's order,
// each with its own unicode-range, so a page fetches a subset only when it
// has characters from it. Only latin is preloaded. The family names and the
// fallback faces are set in globals.css: Turbopack names a local font's CSS
// variable and fallback after the JS constant, not after its font-family.
// Every call stays exported: nothing reads the values, and an unused binding
// could be dropped together with its faces.
// Licences: ./fonts/Inter-OFL.txt and ./fonts/GeistMono-OFL.txt.

export const interCyrillicExt = localFont({
  src: "./fonts/inter-cyrillic-ext.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});
export const interCyrillic = localFont({
  src: "./fonts/inter-cyrillic.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});
export const interGreekExt = localFont({
  src: "./fonts/inter-greek-ext.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+1F00-1FFF" },
  ],
});
export const interGreek = localFont({
  src: "./fonts/inter-greek.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF" },
  ],
});
export const interVietnamese = localFont({
  src: "./fonts/inter-vietnamese.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});
export const interLatinExt = localFont({
  src: "./fonts/inter-latin-ext.woff2",
  weight: "100 900",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
export const interLatin = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

export const geistMonoCyrillicExt = localFont({
  src: "./fonts/geist-mono-cyrillic-ext.woff2",
  weight: "400 500",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+0460-052F, U+1C80-1C8A, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F" },
  ],
});
export const geistMonoCyrillic = localFont({
  src: "./fonts/geist-mono-cyrillic.woff2",
  weight: "400 500",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116" },
  ],
});
export const geistMonoSymbols2 = localFont({
  src: "./fonts/geist-mono-symbols2.woff2",
  weight: "400 500",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+2000-2001, U+2004-2008, U+200A, U+23B8-23BD, U+2500-259F" },
  ],
});
export const geistMonoVietnamese = localFont({
  src: "./fonts/geist-mono-vietnamese.woff2",
  weight: "400 500",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB" },
  ],
});
export const geistMonoLatinExt = localFont({
  src: "./fonts/geist-mono-latin-ext.woff2",
  weight: "400 500",
  preload: false,
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF" },
  ],
});
export const geistMonoLatin = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  weight: "400 500",
  adjustFontFallback: false,
  declarations: [
    { prop: "font-family", value: "'Geist Mono'" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});
