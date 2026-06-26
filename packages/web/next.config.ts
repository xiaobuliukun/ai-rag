import type { NextConfig } from "next";

function extraImagePatterns() {
  return (process.env.NEXT_PUBLIC_IMAGE_HOSTS ?? "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean)
    .map((hostname) => ({
      protocol: "https" as const,
      hostname,
    }));
}

const nextConfig: NextConfig = {
  transpilePackages: ["@juejin-flow/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.byteimg.com",
      },
      {
        protocol: "https",
        hostname: "*.xitu.io",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "p.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p0.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p1.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p2.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p3.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p4.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p5.ssl.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "p2.qhimg.com",
      },
      {
        protocol: "http",
        hostname: "p2.qhimg.com",
      },
      {
        protocol: "https",
        hostname: "lf3-cdn-tos.bytescm.com",
      },
      {
        protocol: "https",
        hostname: "internal-api-drive-stream.feishu.cn",
      },
      {
        protocol: "https",
        hostname: "www.w3cplus.com",
      },
      {
        protocol: "https",
        hostname: "jowayyoung.github.io",
      },
      {
        protocol: "https",
        hostname: "s3-us-west-2.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "static.yangzw.vip",
      },
      {
        protocol: "http",
        hostname: "static.yangzw.vip",
      },
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "user-images.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "img.shields.io",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "source.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "loremflickr.com",
      },
      {
        protocol: "https",
        hostname: "aneventapart.com",
      },
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
      ...extraImagePatterns(),
    ],
  },
};

export default nextConfig;
