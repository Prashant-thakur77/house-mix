import type { NextConfig } from "next";

// A Vercel build without the API address would ship a bundle that calls localhost; fail the build instead.
if (process.env.VERCEL && !process.env.NEXT_PUBLIC_API_URL) throw new Error("NEXT_PUBLIC_API_URL is not set for this Vercel build.");

const nextConfig: NextConfig = {
  // The console is client-rendered against the API (SSE trace, live plan), so Cache Components is off.
  cacheComponents: false,
  transpilePackages: ["@housemix/shared"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
