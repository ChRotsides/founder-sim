import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let phones on the home Wi-Fi load dev resources (npm run dev:phone).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
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
