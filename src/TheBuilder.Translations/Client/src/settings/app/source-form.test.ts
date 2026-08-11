import { describe, expect, it } from "vitest";
import type { Source } from "../../api/generated/models.js";
import { createEmptySource, deliveryEndpoint, sourceAlias, sourceEndpoint, sourceRequest, unavailableLocales } from "./source-form.js";

describe("translation source form", () => {
  it("starts with generic package defaults and every configured site locale", () => {
    const source = createEmptySource(["en-US", "da-DK"]);

    expect(source).toMatchObject({
      alias: "",
      displayName: "",
      endpointTemplate: "",
      enabled: true,
      locales: ["en-US", "da-DK"],
      namespaceMode: "Fixed",
      messageFormat: "Icu",
      headers: [],
    });
  });

  it("creates a stable technical alias from a display name", () => {
    expect(sourceAlias("  Påske Campaign / 2026  ")).toBe("paske-campaign-2026");
  });

  it("keeps removed site locales visible until the editor clears them", () => {
    expect(unavailableLocales(["en-US"], ["en-US", "fr-FR"])).toEqual(["fr-FR"]);
  });

  it("builds the external source API URL for a locale", () => {
    expect(sourceEndpoint("https://translations.example/api/{locale}", "pt/BR"))
      .toBe("https://translations.example/api/pt%2FBR");
  });

  it("builds the Umbraco override API URL for a locale", () => {
    expect(deliveryEndpoint("https://cms.example/umbraco/section/settings", "pt-BR", "website"))
      .toBe("https://cms.example/umbraco/delivery/api/v1/translations/overrides?locale=pt-BR&namespace=website&format=next-intl");
  });

  it("preserves an application path base in the Umbraco override API URL", () => {
    expect(deliveryEndpoint("https://cms.example/cms/umbraco/section/settings?tab=sources", "da", "shared"))
      .toBe("https://cms.example/cms/umbraco/delivery/api/v1/translations/overrides?locale=da&namespace=shared&format=next-intl");
  });

  it("builds the effective translation API URL", () => {
    expect(deliveryEndpoint("https://cms.example/umbraco/section/settings", "en", "website", "all"))
      .toBe("https://cms.example/umbraco/delivery/api/v1/translations/all?locale=en&namespace=website&format=next-intl");
  });

  it("builds an i18next v4 output URL", () => {
    expect(deliveryEndpoint("https://cms.example/umbraco/section/settings", "en", "website", "all", "i18next-v4"))
      .toBe("https://cms.example/umbraco/delivery/api/v1/translations/all?locale=en&namespace=website&format=i18next-v4");
  });

  it("preserves header configuration references when editing a source", () => {
    const source: Source = {
      id: "00000000-0000-0000-0000-000000000001",
      alias: "website",
      displayName: "Website",
      enabled: true,
      transport: {
        endpointTemplate: "https://translations.example/{locale}.json",
        secretName: "Translations:LegacyBearerToken",
        timeoutSeconds: 10,
        maximumResponseBytes: 10_000_000,
        headers: [{ name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey" }],
      },
      parser: {
        locales: ["en-US"],
        namespace: "website",
        namespaceMode: "Fixed",
        messageFormat: "Icu",
      },
    };

    expect(sourceRequest(source).headers).toEqual([
      { name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey" },
    ]);
    expect(sourceRequest(source).secretName).toBe("Translations:LegacyBearerToken");
  });
});
