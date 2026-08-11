import { createClient, defaultPlugins } from "@hey-api/openapi-ts";

const swaggerUrl = process.argv.find((argument) => argument.startsWith("http"));

if (!swaggerUrl) {
  console.error("Usage: pnpm generate-client -- <OpenAPI URL>");
  process.exitCode = 1;
} else {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const response = await fetch(swaggerUrl);
  if (!response.ok) {
    throw new Error(`OpenAPI request failed: ${response.status} ${response.statusText}`);
  }

  await createClient({
    input: await response.json(),
    output: "src/api/openapi",
    plugins: [
      ...defaultPlugins,
      "@hey-api/client-fetch",
      {
        name: "@hey-api/sdk",
        asClass: true,
        classNameBuilder: "TranslationsService",
      },
    ],
  });
}
