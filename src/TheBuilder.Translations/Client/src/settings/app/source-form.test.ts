import { describe, expect, it } from "vitest";
import type { Source } from "../../api/generated/models.js";
import { createEmptySource, deliveryEndpoint, headerIsComplete, headerValueSource, parseNamespaceMode, parseSourceFormat, sourceAlias, sourceEndpoint, sourceRequest, unavailableLocales, withHeaderValueSource, hasLocaleToken } from "./source-form.js";

describe("translation source form", () => {
  it("starts with generic package defaults and every configured site locale", () => {
    const source = createEmptySource(["en-US", "da-DK"]);

    expect(source).toMatchObject({
      alias: "",
      displayName: "",
      endpointTemplate: "",
      enabled: true,
      locales: ["en-US", "da-DK"],
      namespaceMode: "FirstSegment",
      messageFormat: "Icu",
      headers: [],
    });
  });

  /*
   * Translation files are nested under their own first key far more often than they are flat, and
   * that mode needs no namespace typed before the source can be saved. Anything unrecognised lands
   * there too: naming one namespace for every message is the deliberate choice of the two.
   */
  it("assumes the namespace comes from the first JSON key", () => {
    expect(parseNamespaceMode("FirstSegment")).toBe("FirstSegment");
    expect(parseNamespaceMode("Fixed")).toBe("Fixed");
    expect(parseNamespaceMode("")).toBe("FirstSegment");
  });

  /*
   * Not every header is a secret, and making somebody invent an appsettings key for a tenant id is
   * what pushed a real bypass token into the setting-name box, where the failure message then
   * published it. So a row holds one of the two and switching clears the other: a row carrying both
   * is a question about which wins that nobody should have to answer.
   */
  it("keeps a header value and a setting name from ever being set at once", () => {
    const named = { name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey" };
    expect(headerValueSource(named)).toBe("setting");

    const direct = withHeaderValueSource(named, "value");
    expect(direct).toEqual({ name: "X-Api-Key", value: "" });
    expect(headerValueSource(direct)).toBe("value");

    // And back again, without carrying the abandoned field along.
    expect(withHeaderValueSource({ name: "X-Tenant", value: "acme" }, "setting"))
      .toEqual({ name: "X-Tenant", valueConfigurationKey: "" });
  });

  it("treats a row as unfinished until the side it is on is filled in", () => {
    expect(headerIsComplete({ name: "X-Tenant", value: "acme" })).toBe(true);
    expect(headerIsComplete({ name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey" })).toBe(true);

    expect(headerIsComplete({ name: "", value: "acme" })).toBe(false);
    expect(headerIsComplete({ name: "X-Tenant", value: "  " })).toBe(false);
    expect(headerIsComplete({ name: "X-Api-Key", valueConfigurationKey: "" })).toBe(false);
  });

  /*
   * What the file is, not what a message inside it is: a PO catalogue and a nested JSON one can both
   * hold ICU. Nested JSON is where anything unrecognised lands, because it is what every source
   * saved before PO existed is, and an unset format has to keep meaning what it always meant.
   */
  it("reads the catalogue as nested JSON unless it is told otherwise", () => {
    expect(createEmptySource([]).sourceFormat).toBe("NestedJson");
    expect(parseSourceFormat("Po")).toBe("Po");
    expect(parseSourceFormat("NestedJson")).toBe("NestedJson");
    expect(parseSourceFormat("")).toBe("NestedJson");
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
      syncInProgress: false,
      transport: {
        endpointTemplate: "https://translations.example/{locale}.json",
        secretName: "Translations:LegacyBearerToken",
        timeoutSeconds: 10,
        maximumResponseBytes: 10_000_000,
        headers: [
          { name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey", isLiteral: false },
          { name: "X-Tenant", value: "acme", isLiteral: true },
        ],
      },
      parser: {
        locales: ["en-US"],
        namespace: "website",
        namespaceMode: "Fixed",
        messageFormat: "Icu",
        sourceFormat: "NestedJson",
      },
    };

    // Each row keeps the one field it was saved with, and `isLiteral` does not come back: it is the
    // server's read-only view of which of the two is set, so a client that returned it would be
    // submitting a value the server owns and can disagree with.
    expect(sourceRequest(source).headers).toEqual([
      { name: "X-Api-Key", valueConfigurationKey: "Translations:ApiKey" },
      { name: "X-Tenant", value: "acme" },
    ]);
    expect(sourceRequest(source).secretName).toBe("Translations:LegacyBearerToken");
  });
});

describe("locale tokens", () => {
  it("expands {language} to the subtag so a region-less source resolves", () => {
    expect(sourceEndpoint("https://app/messages/{language}.json", "en-US"))
      .toBe("https://app/messages/en.json");
  });

  it("expands both tokens in one template", () => {
    expect(sourceEndpoint("https://app/{language}/{locale}.json", "pt-BR"))
      .toBe("https://app/pt/pt-BR.json");
  });

  it("accepts either token as naming a locale", () => {
    expect(hasLocaleToken("https://app/{locale}.json")).toBe(true);
    expect(hasLocaleToken("https://app/{language}.json")).toBe(true);
    expect(hasLocaleToken("https://app/messages.json")).toBe(false);
  });
});
