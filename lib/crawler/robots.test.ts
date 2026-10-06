import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// robots.txt handling of the crawler, end to end through runSiteCrawl: which
// URLs the crawler fetches, when, and what it reports. DNS and fetch are
// stubbed, the database is an in-memory stand-in (no queries are under test),
// and setTimeout/Date are faked so Crawl-delay and timeouts run instantly.

const store = vi.hoisted(() => ({
  summary: null as Record<string, unknown> | null,
  issues: [] as { url: string; type: string; severity: string; message: string }[],
  pages: [] as { url: string; statusCode: number; redirectUrl: string | null }[],
  progress: [] as number[],
}));
const { lookup } = vi.hoisted(() => ({
  lookup: vi.fn<(host: string) => Promise<{ address: string; family: number }>>(async () => ({
    address: "93.184.216.34",
    family: 4,
  })),
}));

vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));
vi.mock("@/lib/db", () => ({
  db: {
    crawl: {
      create: async () => ({ id: "c1" }),
      update: async ({ data }: { data: { lastProgressAt?: Date } }) => {
        if (data.lastProgressAt) store.progress.push(data.lastProgressAt.getTime());
        return { id: "c1" };
      },
    },
    auditPage: {
      createMany: async ({ data }: { data: typeof store.pages }) => {
        store.pages.push(...data);
        return { count: data.length };
      },
    },
    auditLink: { createMany: async () => ({ count: 0 }) },
    crawlIssue: {
      createMany: async ({ data }: { data: typeof store.issues }) => {
        store.issues.push(...data);
        return { count: data.length };
      },
      create: async ({ data }: { data: { details: Record<string, unknown> } }) => {
        store.summary = data.details;
        return data;
      },
      count: async () => 0,
    },
  },
}));

import { fetchText, runSiteCrawl } from "./engine";

/* ------------------------------------------------------------------ */
/*  A fake web: URL -> response                                        */
/* ------------------------------------------------------------------ */

type Route = Response | ((init: RequestInit) => Response | Promise<Response>);
type Call = { url: string; at: number; end: number };

let routes: Record<string, () => Route>;
let calls: Call[];
let inFlight: Record<string, number>;
let maxInFlight: Record<string, number>;

function page(title: string, links: string[] = []) {
  const a = links.map((l) => `<a href="${l}">${l}</a>`).join("");
  return () =>
    new Response(`<html><head><title>${title}</title></head><body><h1>${title}</h1>${a}</body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
}
function text(body: string, status = 200) {
  return () => new Response(body, { status, headers: { "content-type": "text/plain" } });
}
function xml(urls: string[]) {
  const body = `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  return () => new Response(body, { status: 200, headers: { "content-type": "application/xml" } });
}
function redirect(location: string, status = 301) {
  return () => new Response(null, { status, headers: { location } });
}
/** Never answers; rejects when the crawler aborts the request. */
function hang() {
  return () => (init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason ?? new Error("aborted")));
    });
}

const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
  const url = String(input);
  const origin = new URL(url).origin;
  const call: Call = { url, at: Date.now(), end: Date.now() };
  calls.push(call);
  inFlight[origin] = (inFlight[origin] ?? 0) + 1;
  maxInFlight[origin] = Math.max(maxInFlight[origin] ?? 0, inFlight[origin]);
  try {
    let r: Route = routes[url]?.() ?? new Response("not found", { status: 404 });
    if (typeof r === "function") r = await r(init);
    return r;
  } finally {
    inFlight[origin]--;
    call.end = Date.now();
  }
});

function fetched(url: string) {
  return calls.some((c) => c.url === url);
}
function callsTo(prefix: string) {
  return calls.filter((c) => c.url.startsWith(prefix));
}

/** Runs a crawl while advancing the fake clock until it settles. */
async function crawl(domain = "example.com", maxPages = 50) {
  const p = runSiteCrawl("s1", domain, maxPages);
  let settled = false;
  p.then(
    () => (settled = true),
    () => (settled = true)
  );
  while (!settled) await vi.advanceTimersByTimeAsync(250);
  return p;
}

type OriginReport = {
  origin: string;
  outcome: string;
  robotsStatus: number | null;
  crawlDelay: number | null;
  skipped: number;
  message: string | null;
};
type Report = {
  skipped: number;
  disallowed: number;
  samples: { url: string; redirectedTo?: string }[];
  origins: OriginReport[];
  stopMessage: string | null;
};
function report(): Report | undefined {
  return store.summary?.robots as Report | undefined;
}
function originReport(origin: string) {
  return report()?.origins.find((o) => o.origin === origin);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.stubGlobal("fetch", fetchMock);
  routes = {};
  calls = [];
  inFlight = {};
  maxInFlight = {};
  store.summary = null;
  store.issues = [];
  store.pages = [];
  store.progress = [];
  delete process.env.CRAWL_MAX_MINUTES;
});

afterEach(() => {
  lookup.mockImplementation(async () => ({ address: "93.184.216.34", family: 4 }));
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.CRAWL_MAX_MINUTES;
});

/* ------------------------------------------------------------------ */
/*  Per-origin rules                                                   */
/* ------------------------------------------------------------------ */

describe("robots.txt per origin", () => {
  it("checks www URLs against www's robots.txt when the property is the bare domain", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://www.example.com/robots.txt": text("User-agent: *\nDisallow: /\n"),
      "https://example.com/": page("Home", ["https://www.example.com/a", "/b"]),
      "https://example.com/sitemap.xml": xml(["https://www.example.com/c", "https://example.com/d"]),
      "https://example.com/b": page("B"),
      "https://example.com/d": page("D"),
    };

    await crawl();

    expect(fetched("https://www.example.com/robots.txt")).toBe(true);
    expect(fetched("https://www.example.com/a")).toBe(false);
    expect(fetched("https://www.example.com/c")).toBe(false);
    expect(fetched("https://example.com/b")).toBe(true);
    expect(fetched("https://example.com/d")).toBe(true);
    expect(report()?.disallowed).toBe(2);
    expect(report()?.skipped).toBe(2);
  });

  it("applies the bare domain's Disallow to the bare domain only", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nDisallow: /private\n"),
      "https://www.example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page("Home", ["/private/x", "https://www.example.com/private/y"]),
      "https://www.example.com/private/y": page("Y"),
    };

    await crawl();

    expect(fetched("https://example.com/private/x")).toBe(false);
    expect(fetched("https://www.example.com/private/y")).toBe(true);
    expect(report()?.disallowed).toBe(1);
  });

  it("checks URLs listed in a sitemap on another origin against that origin's rules", async () => {
    routes = {
      "https://example.com/robots.txt": text(
        "User-agent: *\nAllow: /\nSitemap: https://www.example.com/sitemap.xml\n"
      ),
      "https://www.example.com/robots.txt": text("User-agent: *\nDisallow: /private\n"),
      "https://example.com/": page("Home"),
      "https://www.example.com/sitemap.xml": xml([
        "https://www.example.com/private/x",
        "https://www.example.com/ok",
      ]),
      "https://www.example.com/ok": page("OK"),
    };

    await crawl();

    expect(fetched("https://www.example.com/sitemap.xml")).toBe(true);
    expect(fetched("https://www.example.com/ok")).toBe(true);
    expect(fetched("https://www.example.com/private/x")).toBe(false);
    expect(report()?.disallowed).toBe(1);
  });

  it("does not fetch a sitemap that its own origin's robots.txt disallows", async () => {
    routes = {
      "https://example.com/robots.txt": text(
        "User-agent: *\nAllow: /\nSitemap: https://cdn.example.com/sitemap.xml\n"
      ),
      "https://cdn.example.com/robots.txt": text("User-agent: *\nDisallow: /\n"),
      "https://example.com/": page("Home"),
      "https://cdn.example.com/sitemap.xml": xml(["https://example.com/x"]),
    };

    await crawl();

    expect(fetched("https://cdn.example.com/robots.txt")).toBe(true);
    expect(fetched("https://cdn.example.com/sitemap.xml")).toBe(false);
  });

  it("ignores a malformed Sitemap: line instead of failing the crawl", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\nSitemap: not a url\nSitemap: ftp://example.com/s.xml\n"),
      "https://example.com/": page("Home"),
    };

    const result = await crawl();

    expect(result.pagesFound).toBe(1);
  });

  it("fetches each origin's robots.txt once", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://www.example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page(
        "Home",
        Array.from({ length: 20 }, (_, i) => `https://www.example.com/p${i}`)
      ),
    };
    for (let i = 0; i < 20; i++) routes[`https://www.example.com/p${i}`] = page(`P${i}`);

    await crawl();

    expect(callsTo("https://www.example.com/robots.txt")).toHaveLength(1);
    expect(callsTo("https://example.com/robots.txt")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Redirects                                                          */
/* ------------------------------------------------------------------ */

describe("redirects and robots.txt", () => {
  it("stops at a redirect to a disallowed URL and records the page as blocked, not as an error", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nDisallow: /private\n"),
      "https://example.com/": page("Home", ["/old"]),
      "https://example.com/old": redirect("https://example.com/private/new"),
      "https://example.com/private/new": page("Secret"),
    };

    await crawl();

    expect(fetched("https://example.com/old")).toBe(true);
    expect(fetched("https://example.com/private/new")).toBe(false);
    expect(store.issues.filter((i) => i.url === "https://example.com/old")).toEqual([]);
    expect(store.pages.map((p) => p.url)).not.toContain("https://example.com/private/new");
    expect(report()?.samples).toContainEqual({
      url: "https://example.com/old",
      redirectedTo: "https://example.com/private/new",
    });
    expect(report()?.disallowed).toBe(1);
  });

  it("checks a redirect to another origin against that origin's robots.txt", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://www.example.com/robots.txt": text("User-agent: *\nDisallow: /\n"),
      "https://example.com/": page("Home", ["/moved"]),
      "https://example.com/moved": redirect("https://www.example.com/moved"),
      "https://www.example.com/moved": page("Moved"),
    };

    await crawl();

    expect(fetched("https://www.example.com/moved")).toBe(false);
    expect(report()?.samples).toContainEqual({
      url: "https://example.com/moved",
      redirectedTo: "https://www.example.com/moved",
    });
  });

  it("reports a redirect to a host that does not resolve as a broken link, not as a robots.txt skip", async () => {
    lookup.mockImplementation(async (host: string) => {
      if (host === "dead.invalid") throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      return { address: "93.184.216.34", family: 4 };
    });
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page("Home", ["/gone", "/ftp"]),
      "https://example.com/gone": redirect("https://dead.invalid/page"),
      "https://example.com/ftp": redirect("ftp://example.com/file"),
    };

    await crawl();

    const broken = store.issues.filter((i) => i.type === "BROKEN_LINK").map((i) => i.url);
    expect(broken).toEqual(expect.arrayContaining(["https://example.com/gone", "https://example.com/ftp"]));
    expect(fetched("https://dead.invalid/robots.txt")).toBe(false);
    expect(report()?.skipped).toBe(0);
    expect(report()?.origins.map((o) => o.origin)).toEqual(["https://example.com"]);
  });

  it("follows exactly 5 redirects for a page", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page("Home", ["/r0", "/s0"]),
      "https://example.com/r5": page("After five"),
      "https://example.com/s6": page("After six"),
    };
    for (let i = 0; i < 5; i++) routes[`https://example.com/r${i}`] = redirect(`/r${i + 1}`);
    for (let i = 0; i < 6; i++) routes[`https://example.com/s${i}`] = redirect(`/s${i + 1}`);

    await crawl();

    expect(store.pages.find((p) => p.url === "https://example.com/r5")).toMatchObject({
      statusCode: 200,
      redirectUrl: "https://example.com/r5",
    });
    expect(fetched("https://example.com/s5")).toBe(true);
    expect(fetched("https://example.com/s6")).toBe(false);
  });

  it("fetchText follows 5 redirects and refuses a 6th", async () => {
    vi.useRealTimers();
    routes = { "https://example.com/t5": text("five"), "https://example.com/u6": text("six") };
    for (let i = 0; i < 5; i++) routes[`https://example.com/t${i}`] = redirect(`/t${i + 1}`);
    for (let i = 0; i < 6; i++) routes[`https://example.com/u${i}`] = redirect(`/u${i + 1}`);

    expect(await fetchText("https://example.com/t0")).toBe("five");
    expect(await fetchText("https://example.com/u0")).toBeNull();
    expect(fetched("https://example.com/u6")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  robots.txt that cannot be read                                     */
/* ------------------------------------------------------------------ */

describe("robots.txt answers", () => {
  it("allows everything when robots.txt is 404", async () => {
    routes = {
      "https://example.com/": page("Home", ["/a"]),
      "https://example.com/a": page("A"),
    };

    await crawl();

    expect(fetched("https://example.com/a")).toBe(true);
    expect(originReport("https://example.com")).toMatchObject({ outcome: "missing", robotsStatus: 404 });
    expect(store.issues.some((i) => i.type === "MISSING_ROBOTS")).toBe(true);
  });

  it("allows everything when robots.txt is 403", async () => {
    routes = {
      "https://example.com/robots.txt": text("forbidden", 403),
      "https://example.com/": page("Home", ["/a"]),
      "https://example.com/a": page("A"),
    };

    await crawl();

    expect(fetched("https://example.com/a")).toBe(true);
    expect(originReport("https://example.com")?.outcome).toBe("missing");
  });

  it("skips the host when robots.txt answers 503", async () => {
    routes = {
      "https://example.com/robots.txt": text("down", 503),
      "https://example.com/": page("Home", ["/a"]),
      "https://example.com/sitemap.xml": xml(["https://example.com/b"]),
    };

    await crawl();

    expect(calls.map((c) => c.url)).toEqual(["https://example.com/robots.txt"]);
    expect(originReport("https://example.com")).toMatchObject({
      outcome: "unreachable",
      robotsStatus: 503,
      message: "robots.txt unreachable (503), host skipped",
    });
    expect(store.pages).toEqual([]);
  });

  it("skips only the origin whose robots.txt is unreachable", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://www.example.com/robots.txt": text("down", 500),
      "https://example.com/": page("Home", ["/a", "https://www.example.com/b"]),
      "https://example.com/a": page("A"),
      "https://www.example.com/b": page("B"),
    };

    await crawl();

    expect(fetched("https://example.com/a")).toBe(true);
    expect(fetched("https://www.example.com/b")).toBe(false);
    expect(originReport("https://www.example.com")).toMatchObject({
      outcome: "unreachable",
      skipped: 1,
      message: "robots.txt unreachable (500), host skipped",
    });
    expect(report()?.skipped).toBe(1);
  });

  it("reports URLs on a host that does not resolve as broken links", async () => {
    lookup.mockImplementation(async (host: string) => {
      if (host === "www.example.com") throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      return { address: "93.184.216.34", family: 4 };
    });
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page("Home", ["https://www.example.com/a"]),
    };

    await crawl();

    expect(store.issues.find((i) => i.url === "https://www.example.com/a")).toMatchObject({
      type: "BROKEN_LINK",
      severity: "CRITICAL",
      message: "getaddrinfo ENOTFOUND www.example.com",
    });
    expect(report()?.skipped).toBe(0);
    expect(originReport("https://www.example.com")).toBeUndefined();
  });

  it("skips the host when robots.txt times out", async () => {
    routes = {
      "https://example.com/robots.txt": hang(),
      "https://example.com/": page("Home", ["/a"]),
    };

    await crawl();

    expect(calls.map((c) => c.url)).toEqual(["https://example.com/robots.txt"]);
    expect(originReport("https://example.com")).toMatchObject({
      outcome: "unreachable",
      message: "robots.txt unreachable (timeout), host skipped",
    });
  });

  it("uses robots.txt behind a redirect for the original origin", async () => {
    routes = {
      "https://example.com/robots.txt": redirect("https://www.example.com/robots.txt"),
      "https://www.example.com/robots.txt": text("User-agent: *\nDisallow: /private\n"),
      "https://example.com/": page("Home", ["/private/x", "/open"]),
      "https://example.com/open": page("Open"),
    };

    await crawl();

    expect(fetched("https://example.com/open")).toBe(true);
    expect(fetched("https://example.com/private/x")).toBe(false);
  });

  it("follows 5 redirects to reach robots.txt", async () => {
    routes = {
      "https://example.com/r5.txt": text("User-agent: *\nDisallow: /private\n"),
      "https://example.com/": page("Home", ["/private/x"]),
    };
    routes["https://example.com/robots.txt"] = redirect("/r1.txt");
    for (let i = 1; i < 5; i++) routes[`https://example.com/r${i}.txt`] = redirect(`/r${i + 1}.txt`);

    await crawl();

    expect(fetched("https://example.com/r5.txt")).toBe(true);
    expect(fetched("https://example.com/private/x")).toBe(false);
  });

  it("parses only the first 500 KiB of robots.txt", async () => {
    const head = "User-agent: *\nDisallow: /early\n";
    const filler = "# padding\n".repeat(Math.ceil((520 * 1024) / 10));
    const tail = "Disallow: /late\n";
    routes = {
      "https://example.com/robots.txt": text(head + filler + tail),
      "https://example.com/": page("Home", ["/early", "/late"]),
      "https://example.com/late": page("Late"),
    };

    await crawl();

    expect(fetched("https://example.com/early")).toBe(false);
    expect(fetched("https://example.com/late")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Crawl-delay                                                        */
/* ------------------------------------------------------------------ */

describe("Crawl-delay", () => {
  function pagesOf(origin: string) {
    return callsTo(origin).filter((c) => !c.url.endsWith("/robots.txt"));
  }

  it("waits the CrawlSEOBot delay between requests, one request at a time", async () => {
    const links = Array.from({ length: 5 }, (_, i) => `/p${i}`);
    routes = {
      "https://example.com/robots.txt": text(
        "User-agent: *\nCrawl-delay: 1\n\nUser-agent: CrawlSEOBot\nCrawl-delay: 5\nAllow: /\n"
      ),
      "https://example.com/": page("Home", links),
    };
    for (const l of links) routes[`https://example.com${l}`] = page(l);

    await crawl();

    const seq = callsTo("https://example.com");
    expect(seq.length).toBeGreaterThanOrEqual(7); // robots, home, 5 pages (+ sitemaps)
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].at - seq[i - 1].end).toBeGreaterThanOrEqual(5000);
    }
    expect(maxInFlight["https://example.com"]).toBe(1);
    expect(originReport("https://example.com")).toMatchObject({ outcome: "rules", crawlDelay: 5 });
  });

  it("uses the * group's delay when there is no CrawlSEOBot group", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nCrawl-delay: 3\n"),
      "https://example.com/": page("Home", ["/a", "/b"]),
      "https://example.com/a": page("A"),
      "https://example.com/b": page("B"),
    };

    await crawl();

    const seq = pagesOf("https://example.com");
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].at - seq[i - 1].end).toBeGreaterThanOrEqual(3000);
    }
    expect(originReport("https://example.com")?.crawlDelay).toBe(3);
  });

  it("stops the origin early when the delay does not fit in the crawl time limit", async () => {
    process.env.CRAWL_MAX_MINUTES = "1";
    const links = Array.from({ length: 10 }, (_, i) => `/p${i}`);
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nCrawl-delay: 20\n"),
      "https://example.com/": page("Home", links),
    };
    for (const l of links) routes[`https://example.com${l}`] = page(l);

    const result = await crawl();

    const seq = callsTo("https://example.com");
    // robots.txt at 0 s, then one request every 20 s until 60 s.
    expect(seq.length).toBeLessThanOrEqual(4);
    expect(seq[seq.length - 1].at - seq[0].at).toBeLessThanOrEqual(60_000);
    const o = originReport("https://example.com");
    expect(o?.outcome).toBe("stopped-early");
    expect(o?.message).toMatch(/^Crawl-delay 20 s: stopped early after \d+ requests?, the rest does not fit in the 1-minute crawl limit$/);
    expect(o?.skipped).toBeGreaterThan(0);
    expect(result.pagesFound).toBeLessThan(11);
  });

  it("keeps recording progress while it waits, so the stale crawl rule never fires", async () => {
    const links = Array.from({ length: 4 }, (_, i) => `/p${i}`);
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nCrawl-delay: 60\n"),
      "https://example.com/": page("Home", links),
    };
    for (const l of links) routes[`https://example.com${l}`] = page(l);
    const started = Date.now();

    await crawl();

    const seq = callsTo("https://example.com");
    expect(seq[seq.length - 1].at - started).toBeGreaterThanOrEqual(6 * 60_000);
    const beats = [started, ...store.progress];
    for (let i = 1; i < beats.length; i++) {
      expect(beats[i] - beats[i - 1]).toBeLessThanOrEqual(15_000);
    }
  });

  it("skips an origin whose Crawl-delay is longer than 60 s", async () => {
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nCrawl-delay: 120\n"),
      "https://example.com/": page("Home", ["/a"]),
    };

    await crawl();

    expect(calls.map((c) => c.url)).toEqual(["https://example.com/robots.txt"]);
    expect(originReport("https://example.com")).toMatchObject({
      outcome: "delay-too-long",
      crawlDelay: 120,
      message: "Crawl-delay 120 s is longer than we support, host skipped",
    });
  });

  it("does not delay an origin without Crawl-delay", async () => {
    const links = Array.from({ length: 5 }, (_, i) => `/p${i}`);
    routes = {
      "https://example.com/robots.txt": text("User-agent: *\nAllow: /\n"),
      "https://example.com/": page("Home", links),
    };
    for (const l of links) routes[`https://example.com${l}`] = page(l);

    await crawl();

    const seq = pagesOf("https://example.com");
    expect(seq[seq.length - 1].at - seq[0].at).toBeLessThan(5000);
  });
});
