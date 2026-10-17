import { build, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const transportPath = fileURLToPath(new URL("./src/sync/remote.ts", import.meta.url));
let transportVersion = "";

export default defineConfig({
  build: { target: "esnext", modulePreload: { polyfill: false } },
  server: { proxy: { "/api": { target: "http://127.0.0.1:4173", ws: true } } },
  plugins: [
    {
      name: "sync-transport-url",
      apply: "build",
      async buildStart() {
        const output = await build({
          configFile: false, logLevel: "silent",
          build: {
            target: "esnext", write: false,
            rollupOptions: { input: transportPath, preserveEntrySignatures: "strict", output: { inlineDynamicImports: true } },
          },
        });
        const files = (Array.isArray(output) ? output : [output]).flatMap((result) => "output" in result ? result.output : []);
        const transport = files.find((file) => file.type === "chunk");
        if (!transport || transport.imports.length || transport.dynamicImports.length) throw new Error("Sync transport must be self-contained.");
        transportVersion = createHash("sha256").update(transport.code).digest("hex");
        this.emitFile({ type: "asset", fileName: `assets/remote-${transportVersion.slice(0, 12)}.js`, source: transport.code });
      },
      transform(_code, id) {
        if (!id.endsWith("/src/sync/transport-url.ts")) return;
        return { code: 'export default "";', map: null };
      },
      augmentChunkHash(chunk) {
        if (chunk.isEntry && chunk.name === "index") return transportVersion;
      },
      generateBundle(_options, bundle) {
        const chunks = Object.values(bundle).filter((file) => file.type === "chunk");
        const entry = chunks.find((file) => file.isEntry && file.name === "index");
        if (!entry) throw new Error("Cannot resolve the application entry.");
        this.emitFile({ type: "asset", fileName: `${entry.fileName}.sync.json`, source: JSON.stringify({ file: `assets/remote-${transportVersion.slice(0, 12)}.js` }) });
      },
    },
    react(),
    VitePWA({
      injectRegister: false,
      registerType: "autoUpdate",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/api\//],
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^retry$/],
        globPatterns: ["**/*.{css,html,js,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "Svenska.app",
        short_name: "Svenska",
        description: "Offline Swedish-Russian vocabulary lookup",
        theme_color: "#f1f1ef",
        background_color: "#f1f1ef",
        display: "standalone",
      },
    }),
  ],
});
