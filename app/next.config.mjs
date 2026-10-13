/** @type {import('next').NextConfig} */
const nextConfig = {
  // Test mode builds into its own folder so it never touches the real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_AGENT_EVERY_MINUTES: process.env.AGENT_EVERY_MINUTES ?? "" },
  experimental: {
    // Starts the agent's timer when the server starts (src/instrumentation.ts).
    instrumentationHook: true,
    // Server-only packages that should not be bundled.
    serverComponentsExternalPackages: ["pg", "@electric-sql/pglite"],
  },
};

export default nextConfig;
