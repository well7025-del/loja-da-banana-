import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Caminhos relativos: o app roda tanto em servidor quanto empacotado no APK.
  base: "./",
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "dist",
    target: "es2020",
    chunkSizeWarningLimit: 900,
  },
  server: { port: 4180, host: true },
});
