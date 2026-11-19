import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Served by the Rust server at /dashboard (same origin as the API, which is what
// lets the session cookie be SameSite=Strict). In development, Vite serves the app
// and forwards /api to the local server, so the browser still sees one origin.
export default defineConfig({
  base: "/dashboard/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  build: {
    sourcemap: false,
  },
});
