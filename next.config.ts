import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Apple Music album artwork
      { protocol: "https", hostname: "*.mzstatic.com" },
    ],
  },
};

export default nextConfig;
