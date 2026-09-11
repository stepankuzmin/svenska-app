import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{css,html,js,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: "Svenska.app",
        short_name: "Svenska",
        description: "Offline Swedish-Russian vocabulary lookup",
        theme_color: "#f7f3e8",
        background_color: "#f7f3e8",
        display: "standalone",
      },
    }),
  ],
});
