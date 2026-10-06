"use client";

import { useState } from "react";
import {
  Copy,
  Check,
  Terminal,
  Monitor,
  Code2,
  Globe,
  Search,
  FileText,
  Bug,
  Gauge,
  Lightbulb,
  BarChart3,
  Rocket,
} from "lucide-react";

const CONFIG_JSON = `{
  "mcpServers": {
    "crawlseo": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/path/to/crawlseo"
    }
  }
}`;

const TOOLS = [
  {
    category: "Sites",
    items: [
      { name: "list_sites", description: "List all monitored sites with basic info" },
      { name: "get_site_overview", description: "Site KPIs, health score, latest crawl, and vitals" },
    ],
  },
  {
    category: "Keywords & Pages",
    items: [
      { name: "get_keywords", description: "Top keywords by clicks with position and CTR" },
      { name: "get_pages", description: "Top pages by clicks with position and CTR" },
      { name: "get_traffic", description: "Daily clicks and impressions over time" },
    ],
  },
  {
    category: "Crawl & Audit",
    items: [
      { name: "run_crawl", description: "Start a background site crawl" },
      { name: "get_crawl_status", description: "Check crawl progress and results" },
      { name: "get_crawl_issues", description: "List issues found during a crawl" },
    ],
  },
  {
    category: "Performance & SEO",
    items: [
      { name: "get_vitals", description: "Core Web Vitals reports (LCP, CLS, INP, TTFB)" },
      { name: "get_opportunities", description: "SEO opportunities: striking distance, low CTR, decay" },
    ],
  },
];

const SETUP_GUIDES = [
  {
    name: "Claude Code",
    icon: Terminal,
    steps: [
      "Install tsx: npm install -D tsx",
      "Add the config JSON to .claude/settings.json",
      "Replace /path/to/crawlseo with your project path",
      "Restart Claude Code; the tools are available right away",
    ],
  },
  {
    name: "Claude Desktop",
    icon: Monitor,
    steps: [
      "Open Claude Desktop settings",
      "Navigate to Developer > MCP Servers",
      "Add a new server with the config JSON below",
      "Replace /path/to/crawlseo with your project path",
      "Restart Claude Desktop",
    ],
  },
  {
    name: "Cursor",
    icon: Code2,
    steps: [
      "Open Cursor settings (Cmd/Ctrl + ,)",
      "Search for 'MCP' in settings",
      "Add the server config JSON",
      "Replace /path/to/crawlseo with your project path",
      "Restart Cursor",
    ],
  },
];

const ROADMAP = [
  { label: "OAuth2 remote transport", description: "Connect from hosted AI agents without local setup" },
  { label: "Keyword research tools", description: "Research keywords and save results via MCP" },
  { label: "Backlink analysis tools", description: "Query backlink data directly from AI agents" },
  { label: "AI chat assistant", description: "Natural-language SEO Q&A over your site data" },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
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

export function McpPageContent() {
  return (
    <div className="space-y-6">
      {/* Connection config */}
      <div className="panel p-5">
        <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
          MCP Connection
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add this configuration to your AI tool to connect to the crawlseo MCP server.
        </p>
        <div className="mt-4 relative">
          <div className="absolute right-3 top-3">
            <CopyButton text={CONFIG_JSON} />
          </div>
          <pre className="overflow-x-auto rounded-lg border border-border bg-background p-4 text-sm text-foreground">
            <code>{CONFIG_JSON}</code>
          </pre>
        </div>
      </div>

      {/* Setup guides */}
      <div className="panel p-5">
        <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
          Setup guides
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {SETUP_GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <div
                key={guide.name}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-bg-soft text-text-strong">
                    <Icon className="size-4" aria-hidden />
                  </div>
                  <h4 className="font-medium text-text-strong">{guide.name}</h4>
                </div>
                <ol className="space-y-1.5 text-xs text-muted-foreground">
                  {guide.steps.map((step, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-data text-text-strong">
                        {i + 1}.
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      </div>

      {/* Available tools */}
      <div className="panel p-5">
        <h3 className="text-[15px] leading-5 font-semibold text-text-strong">
          Available tools
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          10 tools available across 4 categories
        </p>
        <div className="mt-4 space-y-4">
          {TOOLS.map((group) => (
            <div key={group.category}>
              <h4 className="mb-2 mono-label text-[12px] text-muted-foreground">
                {group.category}
              </h4>
              <div className="space-y-1.5">
                {group.items.map((tool) => (
                  <div
                    key={tool.name}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <code className="shrink-0 rounded-sm bg-bg-section px-1.5 py-0.5 font-data text-[12px] text-text-strong">
                      {tool.name}
                    </code>
                    <span className="text-sm text-muted-foreground">
                      {tool.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="panel p-5">
        <h3 className="flex items-center gap-2 text-[15px] leading-5 font-semibold text-text-strong">
          <Rocket className="size-5 text-text-strong" aria-hidden />
          Roadmap
        </h3>
        <div className="mt-4 space-y-3">
          {ROADMAP.map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-3 rounded-lg border border-dashed border-border px-3 py-2.5"
            >
              <div aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-text-faint" />
              <div>
                <p className="text-sm font-medium text-text-strong">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
