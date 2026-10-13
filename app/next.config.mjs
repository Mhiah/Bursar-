/** @type {import('next').NextConfig} */
const nextConfig = {
  // Test mode builds into its own folder so it never touches the real build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Server-only packages that should not be bundled.
    serverComponentsExternalPackages: ["pg", "@electric-sql/pglite"],
  },
};

export default nextConfig;
