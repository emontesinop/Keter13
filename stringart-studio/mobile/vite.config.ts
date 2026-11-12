import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the build work from any sub-path (GitHub Pages, local preview, file hosting)
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "es2020" },
});
