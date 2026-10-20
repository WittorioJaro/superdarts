import type { NextConfig } from "next";

// Every screen depends on the signed-in session, so the app renders on request
// rather than opting into Cache Components.
const nextConfig: NextConfig = {
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
