import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@juejin-flow/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3001",
        pathname: "/api/assets/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "3001",
        pathname: "/api/assets/**",
      },
    ],
  },
};

export default nextConfig;
