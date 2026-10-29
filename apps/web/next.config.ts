import type { NextConfig } from "next";

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
