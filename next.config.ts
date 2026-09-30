import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow result-image uploads (≤5MB) through Server Actions.
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    // MVP: images are hotlinked from the Civitai CDN; skip optimization until real storage exists.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "image.civitai.com" }],
  },
};

export default nextConfig;
