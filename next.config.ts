import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "esbuild"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
