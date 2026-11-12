import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the build work from any sub-path (GitHub Pages, local preview, file hosting)
export default defineConfig({
  base: "./",
  plugins: [react()],
  // classic worker bundle: module workers fail on some iOS versions / home-screen apps
  worker: { format: "iife" },
  build: { target: "es2020" },
});
