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
  // sharp is a native module whose SVG support loads librsvg at runtime. Bundled
  // into the server chunks it decodes JPEG fine but cannot parse SVG at all —
  // every watermark composite failed with "Input buffer contains unsupported
  // image format", in production as well as dev. Requiring it natively fixes it.
  serverExternalPackages: ["sharp"],
  experimental: {
    // /api/photos is matched by src/proxy.ts, so uploads pass through the proxy
    // on their way to the route — and the proxy truncates request bodies at 10MB
    // by default. A truncated multipart body fails to parse ("expected boundary
    // after body"), which surfaced as a bare "Upload failed". A camera JPEG is
    // 8-15MB and the admin page uploads several at once, so 10MB is far too low.
    // Matched to MAX_UPLOAD_BYTES in the route, which rejects oversized files
    // with a message rather than letting them be silently cut short.
    //
    // Note the name: Next 16 renamed this from middlewareClientMaxBodySize, but
    // the runtime warning still points at the old one.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
