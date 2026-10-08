import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { getLocale, getMessages } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n/provider";
import { getTheme } from "@/lib/appearance-server";

// Inter (variable) for all UI and text.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Geist Mono for uppercase labels (400), button labels (500) and numbers.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "crawlseo",
    template: "%s · crawlseo",
  },
  description: "Self-hosted SEO monitoring: GSC, crawl health, Core Web Vitals",
  applicationName: "crawlseo",
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    colorScheme: theme === "system" ? "light dark" : theme,
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: "#ffffff" },
            { media: "(prefers-color-scheme: dark)", color: "#121518" },
          ]
        : theme === "dark"
          ? "#121518"
          : "#ffffff",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages(locale);
  const theme = await getTheme();
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={`${inter.variable} ${geistMono.variable} h-full`}
    >
      <body className="h-full font-sans">
        <LocaleProvider locale={locale} messages={messages}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
