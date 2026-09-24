import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, lookup, row } = vi.hoisted(() => {
  const row = { id: "site-1", userId: "user-1", domain: "acme.com", gscProperty: "sc-domain:acme.com" };
  return {
    row,
    lookup: vi.fn(),
    db: {
      site: {
        findUnique: vi.fn(async () => ({ userId: row.userId })),
        update: vi.fn(async ({ data }: { data: Partial<typeof row> }) => {
          Object.assign(row, data);
          return { id: row.id, domain: row.domain, gscProperty: row.gscProperty, updatedAt: new Date() };
        }),
      },
    },
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "user-1" } })) }));
// Only DNS is faked, so the real assertPublicDomain decides what is private.
vi.mock("dns/promises", () => ({ lookup, default: { lookup } }));

import { PUT } from "./route";

const DNS: Record<string, string> = {
  "internal.example": "10.0.0.5",
  "loopback.example": "127.0.0.1",
  "metadata.example": "169.254.169.254",
  "new-site.com": "93.184.216.34",
};

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/sites/site-1", { method: "PUT", body: JSON.stringify(body) }),
    { params: Promise.resolve({ siteId: "site-1" }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(row, { domain: "acme.com", gscProperty: "sc-domain:acme.com" });
  lookup.mockImplementation(async (host: string) => {
    const address = DNS[host] ?? host;
    return { address, family: address.includes(":") ? 6 : 4 };
  });
});

describe("PUT /api/sites/[siteId] domain", () => {
  it.each(["internal.example", "loopback.example", "metadata.example", "127.0.0.1", "http://127.0.0.1:8080"])(
    "rejects %s and leaves the row unchanged",
    async (domain) => {
      const res = await put({ domain });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Domain must resolve to a public IP address" });
      expect(db.site.update).not.toHaveBeenCalled();
      expect(row.domain).toBe("acme.com");
    }
  );

  it("rejects a domain that does not resolve", async () => {
    lookup.mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));

    const res = await put({ domain: "nope.invalid" });

    expect(res.status).toBe(400);
    expect(db.site.update).not.toHaveBeenCalled();
    expect(row.domain).toBe("acme.com");
  });

  it("accepts a domain that resolves to a public IP", async () => {
    const res = await put({ domain: "new-site.com" });

    expect(res.status).toBe(200);
    expect((await res.json()).domain).toBe("new-site.com");
    expect(row.domain).toBe("new-site.com");
  });

  it("checks and stores the normalized hostname, not the raw input", async () => {
    const blocked = await put({ domain: "https://internal.example/blog/" });

    expect(blocked.status).toBe(400);
    expect(lookup).toHaveBeenCalledWith("internal.example");
    expect(row.domain).toBe("acme.com");

    const allowed = await put({ domain: "https://new-site.com/blog/" });

    expect(allowed.status).toBe(200);
    expect(lookup).toHaveBeenLastCalledWith("new-site.com");
    expect(row.domain).toBe("new-site.com");
  });

  it("does not resolve anything when only gscProperty changes", async () => {
    const res = await put({ gscProperty: "sc-domain:acme.com" });

    expect(res.status).toBe(200);
    expect(lookup).not.toHaveBeenCalled();
    expect(row.domain).toBe("acme.com");
  });
});
