import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../web", emptyOutDir: true, assetsDir: "ui-assets" },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/assets/dell": "http://127.0.0.1:8000",
      "/user-assets": "http://127.0.0.1:8000",
    },
  },
});
