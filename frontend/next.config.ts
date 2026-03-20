import type { NextConfig } from "next";

const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true, // For stricter builds, set to false
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:5000/api/:path*", // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
