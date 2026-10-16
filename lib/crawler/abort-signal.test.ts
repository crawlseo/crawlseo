import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dns/promises", () => ({
  // Every address of a name, as lookup(name, { all: true }) answers.
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
}));
vi.mock("@/lib/db", () => ({ db: {} }));

import { fetchText } from "./engine";

// The optional abort signal of fetchPublic (HopHooks.signal), seen through
// fetchText. The site crawl passes no signal.

const calls: Array<{ url: string; signal: AbortSignal }> = [];
let respond: (url: string, signal: AbortSignal) => Response | Promise<Response>;

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const signal = init.signal as AbortSignal;
    calls.push({ url, signal });
    return respond(url, signal);
  });
});

/** Settles only when the request's own signal aborts, like a server that never answers. */
const hang = (signal: AbortSignal) =>
  new Promise<Response>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

/** A 200 whose body never ends; the read fails once the request's signal aborts. */
const endlessBody = (signal: AbortSignal) =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("partial"));
        signal.addEventListener("abort", () => c.error(signal.reason));
      },
    })
  );

const STILL_RUNNING = "still running";
/** The result of `p`, or STILL_RUNNING if it takes longer than `ms`. */
const within = <T>(p: Promise<T>, ms = 1_000) =>
  Promise.race([p, new Promise<typeof STILL_RUNNING>((r) => setTimeout(() => r(STILL_RUNNING), ms))]);

const later = (fn: () => void, ms = 30) => setTimeout(fn, ms);

describe("fetchPublic abort signal", () => {
  it("without a signal, follows redirects and reads the body as before", async () => {
    respond = (url) =>
      url === "https://a.example/start"
        ? new Response(null, { status: 301, headers: { location: "/end" } })
        : new Response("body");
    expect(await fetchText("https://a.example/start")).toBe("body");
    expect(calls.map((c) => c.url)).toEqual(["https://a.example/start", "https://a.example/end"]);
    expect(calls.every((c) => !c.signal.aborted)).toBe(true);
  });

  it("with a signal that never aborts, behaves the same", async () => {
    respond = () => new Response("body");
    expect(await fetchText("https://a.example/", { signal: new AbortController().signal })).toBe("body");
    expect(calls).toHaveLength(1);
  });

  it("starts no hop, guard or pace when the signal is already aborted", async () => {
    respond = () => new Response("body");
    const guard = vi.fn(async () => {});
    const pace = vi.fn(async () => () => {});
    const signal = AbortSignal.abort();
    expect(await fetchText("https://a.example/", { guard, pace, signal })).toBeNull();
    expect(calls).toHaveLength(0);
    expect(guard).not.toHaveBeenCalled();
    expect(pace).not.toHaveBeenCalled();
  });

  it("aborts the request in flight", async () => {
    respond = (_url, signal) => hang(signal);
    const outer = new AbortController();
    later(() => outer.abort(new Error("stop")));
    expect(await within(fetchText("https://a.example/", { signal: outer.signal }))).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0].signal.aborted).toBe(true);
    expect((calls[0].signal.reason as Error).message).toBe("stop");
  });

  it("aborts the body read", async () => {
    respond = (_url, signal) => endlessBody(signal);
    const outer = new AbortController();
    later(() => outer.abort());
    expect(await within(fetchText("https://a.example/", { signal: outer.signal }))).toBeNull();
    expect(calls[0].signal.aborted).toBe(true);
  });

  it("follows no redirect once the signal aborts during a hop", async () => {
    const outer = new AbortController();
    respond = (url) => {
      if (url !== "https://a.example/start") return new Response("body");
      outer.abort();
      return new Response(null, { status: 301, headers: { location: "/end" } });
    };
    expect(await fetchText("https://a.example/start", { signal: outer.signal })).toBeNull();
    expect(calls.map((c) => c.url)).toEqual(["https://a.example/start"]);
  });

  it("sends no request when the signal aborts during the robots.txt step (guard)", async () => {
    respond = () => new Response("body");
    const outer = new AbortController();
    const pace = vi.fn(async () => () => {});
    const guard = async () => outer.abort();
    expect(await fetchText("https://a.example/", { guard, pace, signal: outer.signal })).toBeNull();
    expect(calls).toHaveLength(0);
    expect(pace).not.toHaveBeenCalled();
  });

  it("sends no request and frees the origin when the signal aborts during the Crawl-delay wait (pace)", async () => {
    respond = () => new Response("body");
    const outer = new AbortController();
    const release = vi.fn();
    const pace = async () => {
      outer.abort();
      return release;
    };
    expect(await fetchText("https://a.example/", { pace, signal: outer.signal })).toBeNull();
    expect(calls).toHaveLength(0);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
