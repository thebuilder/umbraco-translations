import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const rejectNodeEnvironmentReferences = (): Plugin => ({
  name: "reject-node-environment-references",
  generateBundle(_, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type === "chunk" && output.code.includes("process.env.")) {
        this.error(
          `Browser bundle ${output.fileName} contains an unresolved process.env reference.`
        );
      }
    }
  },
});

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  plugins: [react(), rejectNodeEnvironmentReferences()],
  build: {
    lib: { entry: "src/bundle.manifests.ts", formats: ["es"], fileName: "translations" },
    outDir: "../wwwroot/App_Plugins/TheBuilder.Translations",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { external: [/^@umbraco/] },
  },
});
