import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  outputFileTracingExcludes: { "/*": ["./.local-data/**/*", "./.env", "./.env.*"] },
  allowedDevOrigins: ["localhost", "127.0.0.1"]
};

export default nextConfig;
