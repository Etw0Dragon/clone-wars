import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const repositoryName = env.GITHUB_REPOSITORY?.split("/")[1] ?? "clone-war";
  return {
    // GitHub Pages serves project sites from /<repository>/, while local development
    // keeps the usual root path. All assets, including the game worker, stay relative.
    base: env.GITHUB_ACTIONS ? `/${repositoryName}/` : "/",
    plugins: [react()],
    worker: { format: "es" },
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
