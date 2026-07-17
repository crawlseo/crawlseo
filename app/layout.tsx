import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CrawlSEO",
    template: "%s · CrawlSEO",
  },
  description: "Self-hosted SEO monitoring — GSC, crawl health, Core Web Vitals",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%230c1210'/><path d='M22 68 L50 22 L78 68 Z' fill='none' stroke='%237dff9a' stroke-width='8' stroke-linejoin='round'/><circle cx='50' cy='58' r='6' fill='%237dff9a'/></svg>",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${sourceSans.variable} ${plexMono.variable} h-full dark`}
    >
      <body className="h-full font-sans">{children}</body>
    </html>
  );
}
