import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local development: `npm run dev` with VITE_SUPABASE_URL=http://localhost:5173 proxies Supabase
// paths to a local auth server (9999) and the api function (8787). See README → Local development.
const local = process.env.HSO_LOCAL === "1";

export default defineConfig({
  plugins: [react()],
  server: local
    ? {
        proxy: {
          "/auth/v1": { target: "http://localhost:9999", rewrite: (p) => p.replace(/^\/auth\/v1/, "") },
          "/functions/v1/api": { target: "http://localhost:8787" },
          "/storage/v1": { target: "http://localhost:8787" },
        },
      }
    : undefined,
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
});
