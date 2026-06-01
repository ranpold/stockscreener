import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // For `npm run dev:web` alongside a running `wrangler dev` (port 8787).
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
