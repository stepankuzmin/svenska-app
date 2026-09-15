import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const basePath = process.env.VITE_BASE_PATH ?? "/";
const isPullRequestPreview = basePath.includes("/pr-preview/");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    VitePWA({
      disable: isPullRequestPreview,
      injectRegister: false,
      registerType: "autoUpdate",
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{css,html,js,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallbackDenylist: [/\/pr-preview\//],
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
