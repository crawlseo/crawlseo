import { beforeEach, describe, expect, it, vi } from "vitest";

// Settings > Schedule: whole days from 0 (off) to 90, or null for the server default.

const { saveScheduleSettings } = vi.hoisted(() => ({ saveScheduleSettings: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/user-settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/user-settings")>()),
  getScheduleSettings: vi.fn(async () => ({ crawlDays: null, vitalsDays: 14 })),
  saveScheduleSettings,
}));

import { GET, PUT } from "./route";

const put = (body: unknown) => PUT(new Request("http://localhost/api/user/schedule", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  saveScheduleSettings.mockClear();
  vi.unstubAllEnvs();
});

describe("/api/user/schedule", () => {
  it("saves valid intervals and returns them with the server defaults", async () => {
    vi.stubEnv("SCHEDULE_CRAWL_DAYS", "3");
    const res = await put({ crawlDays: 1, vitalsDays: null });
    expect(res.status).toBe(200);
    expect(saveScheduleSettings).toHaveBeenCalledWith({}, "user-1", { crawlDays: 1, vitalsDays: null });
    expect(await res.json()).toMatchObject({ crawlDays: 1, vitalsDays: null, server: { crawlDefaultDays: 3, vitalsDefaultDays: 7 } });
  });

  it.each([{ crawlDays: -1, vitalsDays: 7 }, { crawlDays: 1.5, vitalsDays: 7 }, { crawlDays: 91, vitalsDays: 7 }, { crawlDays: "x", vitalsDays: 7 }, { crawlDays: 7 }, null])(
    "refuses %j",
    async (body) => {
      expect((await put(body)).status).toBe(400);
      expect(saveScheduleSettings).not.toHaveBeenCalled();
    }
  );

  it("GET says when the server turned a kind off", async () => {
    vi.stubEnv("SCHEDULE_VITALS_DAYS", "0");
    expect(await (await GET()).json()).toMatchObject({ crawlDays: null, vitalsDays: 14, server: { vitalsDefaultDays: 0 } });
  });
});
