/** @type {import('next').NextConfig} */
const nextConfig = {
  // Test mode builds into its own folder so it never touches the real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_AGENT_EVERY_MINUTES: process.env.AGENT_EVERY_MINUTES ?? "" },
  // Server-only packages that should not be bundled.
  // (The agent's timer starts with the server from src/instrumentation.ts.)
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // The site doesn't use next/image, so the image resizing endpoint is turned off.
  images: { unoptimized: true },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // No other site can show Bursar's pages inside a frame (stops click-tricking on the pay and owner pages).
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
