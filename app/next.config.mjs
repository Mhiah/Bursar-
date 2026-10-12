/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Server-only packages that should not be bundled.
    serverComponentsExternalPackages: ["pg", "@electric-sql/pglite"],
  },
};

export default nextConfig;
