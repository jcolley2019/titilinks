import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // HOUSE.1: titilinks lives on 8085 (titiactriz keeps 8080) so both dev
    // servers run simultaneously. strictPort makes a stale 8085 fail LOUDLY
    // instead of silently drifting to 8086 and serving Playwright stale code.
    port: 8085,
    strictPort: true,
    hmr: {
      overlay: false,
    },
    // TPL.3: keep Playwright artifact writes from spamming HMR reloads during
    // full batteries (test-results / report / results dirs are output-only).
    watch: {
      ignored: ['**/tests/results/**', '**/playwright-report/**', '**/test-results/**'],
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  // TL.BUNDLE.1 (AUDIT_rev6 #13): the eager vendor libraries get their own
  // chunks. The routes are lazy (App.tsx) and face-api is lazy (loadFaceApi),
  // so the entry's static closure is the framework plus the public page — but
  // React, the router, Radix, framer-motion, Supabase and react-query alone
  // pushed that single entry past the 1.2 MB guard cap. Splitting them out
  // changes nothing about WHAT /:handle downloads (they were eager already);
  // it caps every chunk and lets the vendor bytes cache across deploys. The
  // exclusion is deliberate: face-api must never be assigned to a static
  // chunk, or it would ride back into the first paint.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Rollup ids are posix-normalised, so this is a plain path split.
          const parts = id.split("/node_modules/");
          if (parts.length < 2) return undefined;
          const seg = parts[parts.length - 1].split("/");
          const pkg = seg[0].startsWith("@") ? `${seg[0]}/${seg[1]}` : seg[0];
          const scope = seg[0];
          if (pkg === "@vladmandic/face-api") return undefined;
          if (["react", "react-dom", "scheduler", "react-router", "react-router-dom"].includes(pkg)) return "vendor-react";
          if (scope === "@radix-ui" || pkg === "framer-motion" || pkg === "lucide-react") return "vendor-ui";
          if (scope === "@supabase" || scope === "@tanstack") return "vendor-data";
          return undefined;
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
}));
