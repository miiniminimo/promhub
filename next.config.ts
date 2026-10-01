import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow image (≤5MB) and chat-file (≤10MB) uploads through Server Actions.
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: {
    // MVP: images are hotlinked from the Civitai CDN; skip optimization until real storage exists.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "image.civitai.com" }],
  },
};

export default nextConfig;
