import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

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

// Light only: tells the browser not to darken form controls and scrollbars.
export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
};

// Earlier versions stored a theme choice under this key. The app is light only
// now, so the value is dropped before first paint. Storage can throw (private
// mode, blocked site data); nothing depends on it, so errors are ignored.
const clearStaleTheme = `try{localStorage.removeItem("crawlseo-theme")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: clearStaleTheme }} />
      </head>
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
