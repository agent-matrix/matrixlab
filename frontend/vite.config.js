import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api-runner": {
        target: process.env.VITE_MATRIXLAB_API_URL || "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-runner/, ""),
      },
    },
  },
});
