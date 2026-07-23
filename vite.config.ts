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
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
}));
