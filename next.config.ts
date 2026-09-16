import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
  : null;

const nextConfig: NextConfig = {
  images: {
    // Proof photos remain private. The page receives short-lived signed URLs, and only this
    // project's Storage host/path is accepted as a remote image source. `search` is deliberately
    // omitted because each signed URL has a different token query string.
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "http:" ? "http" : "https",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/sign/proofs/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
