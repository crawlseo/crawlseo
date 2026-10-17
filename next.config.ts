import type { NextConfig } from "next";
import { APP_REDIRECTS } from "./lib/redirects";

const nextConfig: NextConfig = {
  // standalone is for Docker; Vercel uses its own output
  output: process.env.VERCEL ? undefined : "standalone",
  async redirects() {
    return APP_REDIRECTS;
  },
};

export default nextConfig;
