// vite.config.mjs
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ["REACT_APP_", "VITE_"]);

  const procEnv = Object.fromEntries(
    Object.entries(env).map(([k, v]) => {
      const promoted = k.startsWith("VITE_FIREBASE_")
        ? k.replace("VITE_FIREBASE_", "REACT_APP_FIREBASE_")
        : null;
      return promoted ? [promoted, JSON.stringify(v)] : [k, JSON.stringify(v)];
    })
  );

  return {
    plugins: [
      react({
        // The codebase uses .js for JSX (CRA legacy) — opt every .js into JSX parsing.
        include: /\.(js|jsx|ts|tsx)$/,
      }),
    ],
    define: {
      "process.env": procEnv,
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    esbuild: {
      // Match CRA's loose JSX-in-.js behaviour for the small dependency hits.
      loader: "jsx",
      include: /src\/.*\.(js|jsx)$/,
      exclude: [],
    },
    optimizeDeps: {
      // Force pre-bundle .js files as JSX during dev
      esbuildOptions: { loader: { ".js": "jsx" } },
    },
    server: { port: 3000, open: false },
    build: { outDir: "build", emptyOutDir: true },
    resolve: { extensions: [".js", ".jsx", ".ts", ".tsx", ".json"] },
  };
});
