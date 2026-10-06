import robotsParser from "robots-parser";

/*
 * robots.txt, per RFC 9309 and Google's documented practice:
 *
 * - Rules belong to one origin (scheme, host and port). https://example.com
 *   and https://www.example.com each have their own robots.txt, fetched the
 *   first time a URL on that origin is about to be fetched.
 * - 2xx: the rules apply. Only the first 500 KiB is parsed.
 * - 4xx (404, 401, 403 and the rest, except 429): no rules, everything is
 *   allowed. Also when robots.txt redirects more than 5 times.
 * - 429, 5xx, a network error or a timeout: the origin is treated as fully
 *   disallowed for this crawl.
 * - Crawl-delay of the CrawlSEOBot group (or * when there is no CrawlSEOBot
 *   group) is honoured: one request at a time on that origin, with the delay
 *   between them. A delay over MAX_CRAWL_DELAY_S skips the origin; we never
 *   crawl faster than a site asks.
 */

export const ROBOTS_MAX_BYTES = 500 * 1024;
export const MAX_CRAWL_DELAY_S = 60;
/** How often a Crawl-delay wait records that the crawl is alive. */
const HEARTBEAT_MS = 5_000;

/** What fetching one origin's robots.txt produced. */
export type RobotsFetch =
  | { kind: "response"; status: number; text: string }
  | { kind: "too-many-redirects" }
  | { kind: "error"; reason: "timeout" | "network error" }
  /** The host does not resolve or is private: nothing to ask, nothing to fetch. */
  | { kind: "no-host"; error: string };

export type OriginOutcome =
  /** robots.txt was read and its rules apply. */
  | "rules"
  /** No usable robots.txt (4xx): everything is allowed. */
  | "missing"
  /** robots.txt could not be read (429, 5xx, network error, timeout): host skipped. */
  | "unreachable"
  /** Crawl-delay over MAX_CRAWL_DELAY_S: host skipped. */
  | "delay-too-long"
  /** Crawl-delay made the rest of this origin miss the crawl time limit. */
  | "stopped-early";

export type OriginReport = {
  origin: string;
  outcome: OriginOutcome;
  /** HTTP status of robots.txt, null when there was no response. */
  robotsStatus: number | null;
  /** Crawl-delay in seconds that applies to CrawlSEOBot, if any. */
  crawlDelay: number | null;
  /** URLs on this origin not fetched because of robots.txt. */
  skipped: number;
  message: string | null;
};

/** Stored in the crawl summary row (details.robots) and shown on the crawl page. */
export type RobotsReport = {
  /** Every URL not fetched because of robots.txt: disallowed, or on a skipped origin. */
  skipped: number;
  /** URLs a Disallow rule matched, including redirect targets. */
  disallowed: number;
  /** The first disallowed URLs, with the target when a redirect led there. */
  samples: { url: string; redirectedTo?: string }[];
  /** Every origin whose robots.txt was consulted. */
  origins: OriginReport[];
  /** Set when the crawl stopped at the time limit. */
  stopMessage: string | null;
};

/**
 * "no-host": the origin's host does not resolve or is private. That is not a
 * robots.txt answer; its URLs fail as broken links, without a request.
 */
export type Verdict = "allowed" | "disallowed" | "host-skipped" | "no-host";
export type SkipReason = "disallowed" | "host-skipped";

/** Thrown from a redirect hop whose target robots.txt does not allow. */
export class RobotsBlockedError extends Error {
  constructor(readonly url: string, readonly verdict: SkipReason) {
    super(`Blocked by robots.txt: ${url}`);
  }
}

/** Thrown when the next request on a Crawl-delay origin would start after the time limit. */
export class CrawlDelayStopError extends Error {
  constructor(readonly origin: string) {
    super(`Crawl-delay: ${origin} stopped early`);
  }
}

type Robot = ReturnType<typeof robotsParser>;

type OriginState = OriginReport & {
  robot: Robot | null;
  /** Set when the host does not resolve or is private; not in the report. */
  hostError: string | null;
  sitemaps: string[];
  requests: number;
  /** End of the last request on this origin, for Crawl-delay. */
  lastDone: number;
  /** Requests on a Crawl-delay origin queue here, one at a time. */
  lane: Promise<void>;
};

const SAMPLE_LIMIT = 50;

function originOf(url: string): string {
  return new URL(url).origin;
}

function seconds(s: number): string {
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

/** robots.txt rules as they apply to CrawlSEOBot, from one fetch. */
export function resolveRobots(
  origin: string,
  fetched: RobotsFetch,
  userAgent: string
): Omit<OriginState, "lastDone" | "lane" | "requests"> {
  const base = { origin, robot: null, hostError: null, sitemaps: [], skipped: 0, crawlDelay: null };
  if (fetched.kind === "no-host") {
    return { ...base, hostError: fetched.error, outcome: "missing", robotsStatus: null, message: null };
  }
  if (fetched.kind === "too-many-redirects") {
    return {
      ...base,
      outcome: "missing",
      robotsStatus: null,
      message: "robots.txt redirects more than 5 times, treated as missing",
    };
  }
  if (fetched.kind === "error") {
    return {
      ...base,
      outcome: "unreachable",
      robotsStatus: null,
      message: `robots.txt unreachable (${fetched.reason}), host skipped`,
    };
  }
  const { status } = fetched;
  if (status === 429 || status >= 500) {
    return {
      ...base,
      outcome: "unreachable",
      robotsStatus: status,
      message: `robots.txt unreachable (${status}), host skipped`,
    };
  }
  if (status < 200 || status >= 300) {
    return { ...base, outcome: "missing", robotsStatus: status, message: null };
  }

  // Parsed for this origin even when robots.txt was served from a redirect target.
  const robot = robotsParser(`${origin}/robots.txt`, fetched.text);
  const delay = robot.getCrawlDelay(userAgent);
  const crawlDelay = delay !== undefined && delay > 0 ? delay : null;
  const tooLong = crawlDelay !== null && crawlDelay > MAX_CRAWL_DELAY_S;
  return {
    ...base,
    robot,
    sitemaps: robot.getSitemaps(),
    crawlDelay,
    robotsStatus: status,
    outcome: tooLong ? "delay-too-long" : "rules",
    message: tooLong
      ? `Crawl-delay ${seconds(crawlDelay)} is longer than we support, host skipped`
      : crawlDelay !== null
        ? `Crawl-delay ${seconds(crawlDelay)} honoured, one request at a time`
        : null,
  };
}

/**
 * robots.txt for one crawl: fetched once per origin, consulted before every
 * request, and the Crawl-delay pacing of each origin.
 */
export class RobotsPolicy {
  private states = new Map<string, Promise<OriginState>>();
  private resolved: OriginState[] = [];
  private disallowed = 0;
  private samples: RobotsReport["samples"] = [];
  private stopMessage: string | null = null;

  constructor(
    private readonly opts: {
      fetchRobots: (origin: string) => Promise<RobotsFetch>;
      userAgent: string;
      /** Epoch ms after which no Crawl-delay request may start. */
      deadline: number;
      /** The crawl time limit in minutes, for messages. */
      limitMinutes: number;
      /** Records that the crawl is alive during long waits. */
      heartbeat: () => Promise<void>;
    }
  ) {}

  /** robots.txt of the URL's origin, fetched the first time it is needed. */
  originFor(url: string): Promise<OriginState> {
    const origin = originOf(url);
    let state = this.states.get(origin);
    if (!state) {
      state = this.opts.fetchRobots(origin).then((fetched) => {
        const s: OriginState = {
          ...resolveRobots(origin, fetched, this.opts.userAgent),
          requests: 0,
          // The robots.txt request counts: the first page waits the delay too.
          lastDone: Date.now(),
          lane: Promise.resolve(),
        };
        this.resolved.push(s);
        return s;
      });
      this.states.set(origin, state);
    }
    return state;
  }

  async check(url: string): Promise<Verdict> {
    const s = await this.originFor(url);
    if (s.hostError) return "no-host";
    if (s.outcome === "unreachable" || s.outcome === "delay-too-long" || s.outcome === "stopped-early") {
      return "host-skipped";
    }
    // isAllowed() answers undefined only for a URL on another origin, which
    // originFor() rules out; treat it as allowed like an empty robots.txt.
    return s.robot?.isAllowed(url, this.opts.userAgent) === false ? "disallowed" : "allowed";
  }

  /** Before every request: throws unless robots.txt allows the URL. */
  async guard(url: string): Promise<void> {
    const verdict = await this.check(url);
    if (verdict === "allowed") return;
    // The host resolved for the request but not for robots.txt: never fetch
    // without having read robots.txt, report it like the failed lookup.
    if (verdict === "no-host") throw new Error((await this.originFor(url)).hostError!);
    throw new RobotsBlockedError(url, verdict);
  }

  /** Counts a URL that was not fetched because of robots.txt. */
  async skip(url: string, verdict: SkipReason, redirectedTo?: string): Promise<void> {
    const target = redirectedTo ?? url;
    const s = await this.originFor(target);
    s.skipped++;
    if (verdict === "disallowed") {
      this.disallowed++;
      if (this.samples.length < SAMPLE_LIMIT) {
        this.samples.push(redirectedTo ? { url, redirectedTo } : { url });
      }
    }
  }

  /**
   * Waits for the URL's origin to accept a request: no wait without
   * Crawl-delay, otherwise one request at a time with the delay between the
   * end of one and the start of the next. Returns the function that marks the
   * request done. Throws CrawlDelayStopError when the request would start
   * after the time limit; the origin is then stopped for the rest of the crawl.
   */
  async pace(url: string): Promise<() => void> {
    const s = await this.originFor(url);
    if (s.crawlDelay === null) return () => {};
    const delayMs = s.crawlDelay * 1000;

    let unlock!: () => void;
    const previous = s.lane;
    s.lane = new Promise<void>((resolve) => (unlock = resolve));
    await previous;

    try {
      if (s.outcome === "stopped-early") throw new CrawlDelayStopError(s.origin);
      const startAt = Math.max(Date.now(), s.lastDone + delayMs);
      if (startAt > this.opts.deadline) {
        this.stopEarly(s);
        throw new CrawlDelayStopError(s.origin);
      }
      for (let left = startAt - Date.now(); left > 0; left = startAt - Date.now()) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(left, HEARTBEAT_MS)));
        await this.opts.heartbeat();
      }
    } catch (err) {
      unlock();
      throw err;
    }

    s.requests++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      s.lastDone = Date.now();
      unlock();
    };
  }

  private stopEarly(s: OriginState): void {
    if (s.outcome === "stopped-early" || s.crawlDelay === null) return;
    s.outcome = "stopped-early";
    s.message =
      `Crawl-delay ${seconds(s.crawlDelay)}: stopped early after ${s.requests} ` +
      `${s.requests === 1 ? "request" : "requests"}, the rest does not fit in the ` +
      `${this.opts.limitMinutes}-minute crawl limit`;
  }

  /**
   * The crawl reached its time limit with `remaining` URLs not fetched. A
   * Crawl-delay origin among them is reported as stopped early, with its URLs
   * counted as skipped.
   */
  async timeLimitReached(remaining: string[]): Promise<void> {
    if (remaining.length === 0) return;
    this.stopMessage = `Stopped at the ${this.opts.limitMinutes}-minute crawl limit`;
    const known = new Map(this.resolved.map((s) => [s.origin, s]));
    for (const url of remaining) {
      const s = known.get(originOf(url));
      if (!s || s.crawlDelay === null) continue;
      if (s.outcome !== "rules" && s.outcome !== "stopped-early") continue;
      if (s.robot?.isAllowed(url, this.opts.userAgent) === false) continue;
      this.stopEarly(s);
      s.skipped++;
    }
  }

  report(): RobotsReport {
    const origins = this.resolved.filter((s) => !s.hostError).map((s) => ({
      origin: s.origin,
      outcome: s.outcome,
      robotsStatus: s.robotsStatus,
      crawlDelay: s.crawlDelay,
      skipped: s.skipped,
      message: s.message,
    }));
    return {
      skipped: origins.reduce((n, o) => n + o.skipped, 0),
      disallowed: this.disallowed,
      samples: this.samples,
      origins,
      stopMessage: this.stopMessage,
    };
  }
}
