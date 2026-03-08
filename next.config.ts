import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent page from being embedded in an iframe (clickjacking protection)
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent browser from MIME-sniffing the content type
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Control what referrer info is sent with requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser XSS filter (modern browsers don't use it, but older ones do)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Control browser features (camera, mic, etc.)
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Force HTTPS for 1 year (only applies in production)
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  // Basic Content Security Policy
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com", // unsafe-eval needed for Next.js
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.amazonaws.com https://*.razorpay.com",
      "connect-src 'self' https://*.amazonaws.com https://*.razorpay.com",
      "frame-src https://*.razorpay.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // pdfkit + fontkit are pure Node.js modules — tell Turbopack/webpack not to bundle them
  serverExternalPackages: ["pdfkit", "fontkit"],

  eslint: {
    ignoreDuringBuilds: true,
  },

  turbopack: {
    root: __dirname,
  },

  // Optimize for faster dev server
  reactStrictMode: false, // Disable to prevent double renders in dev

  // Disable devtools indicator to avoid known Next.js 15.5.x crash
  devIndicators: false,

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },

  // Redirect tier1 UI routes to tier2 (tier1 has been removed)
  // Note: /api/tier1/upload is kept for AI analysis functionality used by tier2
  async redirects() {
    return [
      {
        source: "/tier1",
        destination: "/tier2/dashboard",
        permanent: true,
      },
      {
        source: "/tier1/dashboard",
        destination: "/tier2/dashboard",
        permanent: true,
      },
      {
        source: "/tier1/upload",
        destination: "/tier2/dashboard",
        permanent: true,
      },
      {
        source: "/tier1/scans",
        destination: "/tier2/dashboard",
        permanent: true,
      },
      {
        source: "/tier1/scans/:path*",
        destination: "/tier2/dashboard",
        permanent: true,
      },
    ];
  },

};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "dermacloud",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
