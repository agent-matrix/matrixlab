import { defineConfig } from "vite";

// Ports chosen to avoid GitPilot's defaults (its backend is :8000, its
// frontend is :5173). MatrixLab is the addon, so it gets the offset
// ports. Both are overridable via env if a deployment needs different
// values.
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: Number(process.env.MATRIXLAB_FRONTEND_PORT) || 5273,
    proxy: {
      "/api-runner": {
        target: process.env.VITE_MATRIXLAB_API_URL || "http://localhost:8765",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-runner/, ""),
      },
    },
  },
});
