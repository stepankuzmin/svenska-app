import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const transportPath = fileURLToPath(new URL("./src/sync/remote.ts", import.meta.url));
let transportVersion = "";

export default defineConfig({
  build: { target: "esnext", modulePreload: { polyfill: false }, rollupOptions: { output: { minifyInternalExports: false } } },
  server: { proxy: { "/api": { target: "http://127.0.0.1:4173", ws: true } } },
  plugins: [
    {
      name: "sync-transport-url",
      apply: "build",
      buildStart() {
        transportVersion = createHash("sha256").update(readFileSync(transportPath))
          .update(readFileSync(new URL("./package-lock.json", import.meta.url))).digest("hex");
        this.emitFile({ type: "chunk", id: transportPath, preserveSignature: "allow-extension" });
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
        const transport = chunks.find((file) => file.modules[transportPath] && file.exports.includes("createRemote"));
        if (!entry || !transport) throw new Error("Cannot resolve the sync transport build.");
        this.emitFile({ type: "asset", fileName: `${entry.fileName}.sync.json`, source: JSON.stringify({ file: transport.fileName }) });
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
