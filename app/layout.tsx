import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const interHeading = Inter({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700"],
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
  description:
    "Self-hosted SEO monitoring — GSC, crawl health, Core Web Vitals",
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%23A78BFA'/><path d='M22 68 L50 22 L78 68 Z' fill='none' stroke='%230C0C0E' stroke-width='8' stroke-linejoin='round'/><circle cx='50' cy='58' r='6' fill='%230C0C0E'/></svg>",
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
      className={`${inter.variable} ${interHeading.variable} ${plexMono.variable} dark h-full`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('crawlseo-theme')||'dark';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className="h-full font-sans"
        style={{
          fontFamily:
            'var(--font-sans), "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
