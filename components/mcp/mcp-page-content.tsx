"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, ShieldCheck, Terminal } from "lucide-react";

const TOOLS = [
  {
    category: "Sites",
    items: [
      { name: "list_sites", description: "Your sites with their IDs and Search Console properties" },
      { name: "get_site_overview", description: "28-day KPIs, the latest crawl and vitals" },
    ],
  },
  {
    category: "Keywords & Pages",
    items: [
      { name: "get_keywords", description: "Top queries, for the last N days or a date range" },
      { name: "get_pages", description: "Top pages, for the last N days or a date range" },
      { name: "get_traffic", description: "Daily clicks and impressions" },
    ],
  },
  {
    category: "Crawl & Audit",
    items: [
      { name: "list_crawls", description: "The latest crawls with status and health score" },
      { name: "get_crawl_issues", description: "Issues found by a crawl, by severity" },
    ],
  },
  {
    category: "Performance & SEO",
    items: [
      { name: "get_vitals", description: "Core Web Vitals reports (LCP, CLS, INP, TTFB)" },
      { name: "get_opportunities", description: "Striking distance, low CTR, content decay, cannibalization" },
    ],
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="size-3 text-success" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy
        </>
      )}
    </button>
  );
}

function Command({ label, command }: { label: string; command: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="relative">
        <div className="absolute top-2.5 right-2.5">
          <CopyButton text={command} />
        </div>
        <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 pr-24 text-sm text-foreground">
          <code>{command}</code>
        </pre>
      </div>
    </div>
  );
}

export function McpPageContent({
  endpoint,
  origin,
  enabled,
}: {
  endpoint: string;
  origin: string;
  enabled: boolean;
}) {
  const http = `claude mcp add --transport http crawlseo ${endpoint} --header "Authorization: Bearer <key>"`;
  const stdio = `claude mcp add crawlseo -e CRAWLSEO_URL=${origin} -e CRAWLSEO_API_KEY=<key> -- npx -y @crawlseo/mcp`;

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <h3 className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-text-strong">
          <KeyRound className="size-4" aria-hidden />
          1. Turn on MCP and create a key
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {enabled
            ? "MCP is on for your account. Create a key in Settings > MCP; it is shown once."
            : "MCP is off for your account, and every key is refused until you turn it on in Settings > MCP. Create a key there; it is shown once."}
        </p>
        <Link href="/settings#mcp" className="mt-3 inline-block text-sm font-medium text-link hover:underline">
          Open Settings &gt; MCP
        </Link>
      </div>

      <div className="panel space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-text-strong">
            <Terminal className="size-4" aria-hidden />
            2. Connect Claude Code
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">Run one of these with your key in place of &lt;key&gt;.</p>
        </div>
        <Command label="Over HTTP, to this instance's /mcp endpoint" command={http} />
        <Command label="Over stdio, with the @crawlseo/mcp package" command={stdio} />
      </div>

      <div className="panel p-5">
        <h3 className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-text-strong">
          <ShieldCheck className="size-4" aria-hidden />
          Read-only tools
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          9 tools across 4 categories. They read your own sites&apos; data and nothing else: no tool changes anything or
          starts a crawl or sync.
        </p>
        <div className="mt-4 space-y-4">
          {TOOLS.map((group) => (
            <div key={group.category}>
              <h4 className="mb-2 mono-label text-[12px] text-muted-foreground">{group.category}</h4>
              <div className="space-y-1.5">
                {group.items.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <code className="shrink-0 rounded-sm bg-bg-section px-1.5 py-0.5 font-data text-[12px] text-text-strong">
                      {tool.name}
                    </code>
                    <span className="text-sm text-muted-foreground">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
