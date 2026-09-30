import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // MVP: images are hotlinked from the Civitai CDN; skip optimization until real storage exists.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "image.civitai.com" }],
  },
};

export default nextConfig;
