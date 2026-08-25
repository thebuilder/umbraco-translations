import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

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
        // Everything that calls a React hook has to be pre-bundled together, or Vite optimises the
        // table and the virtualizer into their own bundles with their own copy of React and every
        // hook they call reads from a null dispatcher. This surfaces as "Cannot read properties of
        // null (reading 'useReducer')" the first time a test renders the grid.
        optimizeDeps: {
          include: [
            "react",
            "react-dom",
            "react/jsx-dev-runtime",
            "@testing-library/react",
            "@tanstack/react-query",
            "@tanstack/react-table",
            "@tanstack/react-virtual",
          ],
        },
        resolve: { dedupe: ["react", "react-dom"] },
        test: {
          name: "dom",
          include: ["src/**/*.dom.test.tsx"],
          // A real browser rather than jsdom. What these tests assert is focus behaviour --
          // roving tabindex over rows that virtualization mounts and unmounts -- and jsdom
          // reimplements focus rather than having it, so it is precisely the area where passing
          // there says least about the backoffice.
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
