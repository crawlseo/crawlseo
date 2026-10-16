import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const httpsRequest = vi.hoisted(() => vi.fn());
vi.mock("node:https", () => ({ request: httpsRequest }));

const {
  LATEST_RELEASE_URL,
  checkForUpdate,
  createUpdateChecker,
  httpsGet,
  newerRelease,
  parseVersion,
} = await import("./update-check");

function releaseBody(tag: unknown) {
  return JSON.stringify({ tag_name: tag, html_url: "https://example.com/not-used" });
}

function getReturning(status: number, body: string) {
  return vi.fn(async () => ({ status, body }));
}

afterEach(() => {
  vi.useRealTimers();
  httpsRequest.mockReset();
});

describe("version comparison", () => {
  it("shows a newer release with a link to its GitHub page", async () => {
    const get = getReturning(200, releaseBody("v0.3.0"));
    await expect(checkForUpdate(get, "0.2.6")).resolves.toEqual({
      version: "0.3.0",
      url: "https://github.com/crawlseo/crawlseo/releases/tag/v0.3.0",
    });
    expect(newerRelease(releaseBody("v0.2.7"), "0.2.6")?.version).toBe("0.2.7");
    expect(newerRelease(releaseBody("v1.0.0"), "0.10.9")?.version).toBe("1.0.0");
    expect(newerRelease(releaseBody("v0.10.0"), "0.9.0")?.version).toBe("0.10.0");
  });

  it("shows nothing for the same version", async () => {
    await expect(checkForUpdate(getReturning(200, releaseBody("v0.2.6")), "0.2.6")).resolves.toBeNull();
    expect(newerRelease(releaseBody("0.2.6"), "0.2.6")).toBeNull();
  });

  it("shows nothing for an older release", async () => {
    await expect(checkForUpdate(getReturning(200, releaseBody("v0.2.5")), "0.2.6")).resolves.toBeNull();
    expect(newerRelease(releaseBody("v0.9.9"), "0.10.0")).toBeNull();
  });

  it("shows nothing for a malformed response", async () => {
    for (const body of [
      "not json",
      "null",
      "[]",
      JSON.stringify({}),
      releaseBody(3),
      releaseBody("latest"),
      releaseBody("v1.0"),
      releaseBody("v1.0.0-beta.1"),
      releaseBody("v1.0.0<script>"),
    ]) {
      await expect(checkForUpdate(getReturning(200, body), "0.2.6")).resolves.toBeNull();
    }
    // An error status (rate limit, not found) is not a release.
    await expect(checkForUpdate(getReturning(403, releaseBody("v9.0.0")), "0.2.6")).resolves.toBeNull();
    expect(parseVersion("v0.2.6")).toEqual([0, 2, 6]);
  });

  it("sends only a User-Agent with the app version, with a 5 s timeout", async () => {
    const get = getReturning(200, releaseBody("v0.2.6"));
    await checkForUpdate(get, "0.2.6");
    expect(get).toHaveBeenCalledWith(LATEST_RELEASE_URL, { "User-Agent": "crawlseo/0.2.6" }, 5000);
    expect(LATEST_RELEASE_URL).toBe("https://api.github.com/repos/crawlseo/crawlseo/releases/latest");
  });
});

describe("timeout", () => {
  it("gives up after 5 s and shows nothing", async () => {
    vi.useFakeTimers();
    const req = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn((err: Error) => req.emit("error", err)),
    });
    httpsRequest.mockReturnValue(req);

    const result = checkForUpdate(httpsGet, "0.2.6");
    await vi.advanceTimersByTimeAsync(4999);
    expect(req.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(req.destroy).toHaveBeenCalledOnce();
    await expect(result).resolves.toBeNull();

    // node:https is called with exactly the one header.
    expect(httpsRequest).toHaveBeenCalledWith(
      LATEST_RELEASE_URL,
      { method: "GET", headers: { "User-Agent": "crawlseo/0.2.6" } },
      expect.any(Function)
    );
  });

  it("a network failure shows nothing", async () => {
    const get = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND api.github.com");
    });
    await expect(checkForUpdate(get, "0.2.6")).resolves.toBeNull();
  });
});

describe("daily cache", () => {
  it("never waits for the check, then serves the result for a day plus jitter", async () => {
    let time = 0;
    const get = getReturning(200, releaseBody("v0.3.0"));
    const checker = createUpdateChecker({
      get,
      currentVersion: "0.2.6",
      env: {},
      now: () => time,
      random: () => 0.5,
    });

    expect(checker.current()).toBeNull(); // first render: nothing yet, check started
    await checker.settled();
    expect(checker.current()?.version).toBe("0.3.0");
    expect(get).toHaveBeenCalledOnce();

    time = 24 * 60 * 60 * 1000 + 30 * 60 * 1000 - 1; // day + half of the hour of jitter
    checker.current();
    expect(get).toHaveBeenCalledOnce();

    time += 1;
    checker.current();
    await checker.settled();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("asks once while a check is still running", async () => {
    const get = getReturning(200, releaseBody("v0.3.0"));
    const checker = createUpdateChecker({ get, currentVersion: "0.2.6", env: {} });
    checker.current();
    checker.current();
    await checker.settled();
    expect(get).toHaveBeenCalledOnce();
  });
});

describe("CRAWLSEO_UPDATE_CHECK=false", () => {
  it("makes no request at all", async () => {
    for (const value of ["false", "FALSE", " false "]) {
      const get = getReturning(200, releaseBody("v9.0.0"));
      const checker = createUpdateChecker({
        get,
        currentVersion: "0.2.6",
        env: { CRAWLSEO_UPDATE_CHECK: value },
      });
      expect(checker.current()).toBeNull();
      await checker.settled();
      expect(checker.current()).toBeNull();
      expect(get).not.toHaveBeenCalled();
    }
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("the shared checker reads the env too", async () => {
    vi.stubEnv("CRAWLSEO_UPDATE_CHECK", "false");
    try {
      const { availableUpdate } = await import("./update-check");
      expect(availableUpdate()).toBeNull();
      expect(httpsRequest).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
