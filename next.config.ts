import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The scored canon is read from disk at runtime (see lib/canon-snapshot.ts),
  // so it has to be traced into the server bundle explicitly.
  outputFileTracingIncludes: {
    "/*": ["data/*.json"],
  },
  images: {
    remotePatterns: [
      // Apple Music album artwork
      { protocol: "https", hostname: "*.mzstatic.com" },
    ],
  },
};

export default nextConfig;
