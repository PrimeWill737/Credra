import type { NextConfig } from "next";
import path from "path";

const securityHeaders: { key: string; value: string }[] = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  sassOptions: {
    includePaths: [path.join(__dirname, "styles", "scss")],
  },
  webpack(config) {
    // Make CSS module class names deterministic/readable in DevTools (no random numeric suffix).
    // Note: This can increase the chance of classname collisions across modules, but this repo
    // uses CSS modules mostly locally for small isolated components.
    const setLocalIdentName = (rule: unknown) => {
      if (!rule || typeof rule !== "object") return;
      const r = rule as Record<string, unknown>;
      if (Array.isArray(r.use)) {
        for (const u of r.use) {
          if (!u || typeof u !== "object") continue;
          const uObj = u as Record<string, unknown>;
          const loader = uObj.loader;
          const options = uObj.options;
          if (typeof loader === "string" && loader.includes("css-loader")) {
            if (options && typeof options === "object") {
              const o = options as Record<string, unknown>;
              if (o.modules && typeof o.modules === "object") {
                (o.modules as Record<string, unknown>).localIdentName = "[local]";
              }
            }
          }
        }
      }
      if (Array.isArray(r.oneOf)) {
        for (const one of r.oneOf) setLocalIdentName(one);
      }
    };

    if (config.module && Array.isArray(config.module.rules)) {
      for (const rule of config.module.rules) setLocalIdentName(rule);
    }

    return config;
  },
};

export default nextConfig;
