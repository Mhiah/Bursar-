/** @type {import('next').NextConfig} */
const nextConfig = {
  // Test mode builds into its own folder so it never touches the real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: { NEXT_PUBLIC_AGENT_EVERY_MINUTES: process.env.AGENT_EVERY_MINUTES ?? "" },
  // Server-only packages that should not be bundled.
  // (The agent's timer starts with the server from src/instrumentation.ts.)
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // A short link to the whitepaper PDF.
  async redirects() {
    return [{ source: "/whitepaper", destination: "/bursar-whitepaper.pdf", permanent: false }];
  },
};

export default nextConfig;
