import type { NextConfig } from "next";

// Every screen depends on the signed-in session, so the app renders on request
// rather than opting into Cache Components.
const nextConfig: NextConfig = {
  // The caller's clips live under a versioned folder and are never edited in place, so phones can keep them for good.
  async headers() {
    return [{ source: "/caller/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
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
