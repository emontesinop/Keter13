import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true, proxy: { "/api": { target: "http://localhost:8787", changeOrigin: false } } },
  preview: { port: 4173, host: true, proxy: { "/api": "http://localhost:8787" } },
  build: { target: "es2020", chunkSizeWarningLimit: 1500 },
});
