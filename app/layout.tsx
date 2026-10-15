import type { Metadata, Viewport } from "next";
import "./fonts";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: clearStaleTheme }} />
      </head>
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
