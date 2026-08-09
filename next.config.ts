import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 90],
  },
  // /api/photos writes preview and thumb JPEGs into public/ at runtime. Tracing
  // sees those statically-resolvable paths and copies both folders into the
  // route's server bundle — ~6.4 MB of images the route only ever writes over,
  // and public/ ships separately anyway. These are write targets, not reads, so
  // excluding them costs the route nothing; it mkdir -p's them before writing.
  outputFileTracingExcludes: {
    "/api/photos": ["public/photos/preview/**/*", "public/photos/thumb/**/*"],
  },
};

export default nextConfig;
