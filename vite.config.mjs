// vite.config.mjs
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vite natively exposes VITE_* env vars via import.meta.env.
// We mirror REACT_APP_* into import.meta.env so legacy env names keep working.

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["REACT_APP_", "VITE_"]);

  const mirroredDefines = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("REACT_APP_")) {
      mirroredDefines[`import.meta.env.${k}`] = JSON.stringify(v);
    }
  }

  return {
    plugins: [
      react({
        // The codebase uses .js for JSX (CRA legacy). plugin-react@4 honors
        // this include rule; without it, files like src/index.js (which uses
        // <React.StrictMode>) are seen by Rollup's pre-pass as plain JS and
        // fail to parse JSX angle brackets.
        include: /\.(mjs|js|jsx|ts|tsx)$/,
      }),
    ],
    define: mirroredDefines,
    esbuild: {
      loader: "jsx",
      include: /src\/.*\.(js|jsx)$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: { loader: { ".js": "jsx" } },
    },
    server: { port: 3000, open: false },
    build: { outDir: "build", emptyOutDir: true },
    resolve: { extensions: [".js", ".jsx", ".ts", ".tsx", ".json"] },
  };
});
