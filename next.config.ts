import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for faster dev server
  reactStrictMode: false, // Disable to prevent double renders in dev

  // Faster builds
  swcMinify: true,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },

  // Webpack optimization
  webpack: (config, { dev }) => {
    if (dev) {
      // Reduce memory usage in development
      config.optimization = {
        ...config.optimization,
        minimize: false,
      };
    }
    return config;
  },
};

export default nextConfig;
