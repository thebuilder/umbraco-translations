import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Split so the pure-logic suite stays fast. Anything needing a DOM opts in by being named
// *.dom.test.tsx; everything else runs in node with no environment setup at all.
export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.dom.test.tsx"],
        },
      },
    ],
  },
});
