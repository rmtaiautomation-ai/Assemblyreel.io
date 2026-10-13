import type { NextConfig } from "next";

// Refuse publishing a privileged key through a NEXT_PUBLIC variable.
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (publicKey) {
  let allowed = publicKey.startsWith("sb_publishable_");
  try { allowed ||= JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url").toString()).role === "anon"; } catch { /* Invalid/non-public key. */ }
  if (!allowed) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must be a public anon/publishable key.");
}

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "64kb" } },
  images: {
    // The optimizer must not become an alternate download path for legacy output.
    localPatterns: [{ pathname: "/logo.jpg", search: "" }],
  },
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "esbuild"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
