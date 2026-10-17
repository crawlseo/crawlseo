import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("app redirects", () => {
  it("sends /dashboard to the All sites home with a permanent (308) redirect", async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual({ source: "/dashboard", destination: "/sites", permanent: true });
  });
});
