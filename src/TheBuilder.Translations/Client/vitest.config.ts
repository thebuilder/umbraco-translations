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
