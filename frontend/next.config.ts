import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
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
