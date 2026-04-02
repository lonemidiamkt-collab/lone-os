import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone", // Disabled — causes ENOENT race conditions on paths with spaces. Re-enable for Docker deploys.
};

export default nextConfig;
