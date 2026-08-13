import { describe, expect, it } from "vitest";
import { hashKey } from "@tanstack/react-query";
import { queryKeys } from "../api/keys.js";
import {
  defaultFilters,
  isNavigationalChange,
  normalizeFilters,
  parseFilters,
  serializeFilters,
} from "./filters.js";

describe("normalizeFilters", () => {
  it("collapses empty and whitespace values onto null", () => {
    const filters = normalizeFilters({ locale: "  ", namespace: "", keyPrefix: "   ", query: "  " });

    expect(filters.locale).toBeNull();
    expect(filters.namespace).toBeNull();
    expect(filters.keyPrefix).toBeNull();
    expect(filters.query).toBe("");
  });

  it("trims surrounding whitespace from values it keeps", () => {
    expect(normalizeFilters({ locale: " da-DK " }).locale).toBe("da-DK");
    expect(normalizeFilters({ query: "  cart  " }).query).toBe("cart");
  });

  it("sorts and de-duplicates the compare set", () => {
    expect(normalizeFilters({ compare: ["sv-SE", "de-DE", "sv-SE"] }).compare).toEqual(["de-DE", "sv-SE"]);
  });

  it("drops compare locales already shown as target or reference", () => {
    const filters = normalizeFilters({
      locale: "da-DK",
      referenceLocale: "en-US",
      compare: ["en-US", "da-DK", "de-DE"],
    });

    expect(filters.compare).toEqual(["de-DE"]);
  });

  it("strips a trailing dot from a key prefix", () => {
    expect(normalizeFilters({ keyPrefix: "checkout.errors." }).keyPrefix).toBe("checkout.errors");
    expect(normalizeFilters({ keyPrefix: "." }).keyPrefix).toBeNull();
  });

  it("falls back to a default for unrecognised enum values", () => {
    const filters = normalizeFilters({
      status: "NotAStatus" as never,
      sort: "sideways" as never,
      direction: "up" as never,
    });

    expect(filters.status).toBe("All");
    expect(filters.sort).toBe("key");
    expect(filters.direction).toBe("asc");
  });
});

describe("url round-trip", () => {
  it("omits defaults so a pristine editor has a clean url", () => {
    expect(serializeFilters(defaultFilters)).toBe("");
  });

  it("round-trips a fully populated filter set", () => {
    const filters = normalizeFilters({
      locale: "da-DK",
      referenceLocale: "en-US",
      compare: ["de-DE", "sv-SE"],
      namespace: "website",
      keyPrefix: "checkout.errors",
      query: "cart",
      status: "NeedsReview",
      sort: "updatedAt",
      direction: "desc",
    });

    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it("round-trips defaults through an empty query string", () => {
    expect(parseFilters(serializeFilters(defaultFilters))).toEqual(defaultFilters);
  });

  it("ignores unknown query parameters", () => {
    expect(parseFilters("?locale=da-DK&somethingElse=1")).toEqual(
      normalizeFilters({ locale: "da-DK" }),
    );
  });
});

describe("query keys", () => {
  it("hashes equivalent filters to the same key regardless of field order", () => {
    const a = normalizeFilters({ locale: "da-DK", status: "Overridden", compare: ["de-DE"] });
    const b = normalizeFilters({ compare: ["de-DE"], status: "Overridden", locale: "da-DK" });

    expect(hashKey(queryKeys.keyList(a))).toBe(hashKey(queryKeys.keyList(b)));
  });

  it("hashes differently-ordered compare sets to the same key", () => {
    const a = normalizeFilters({ compare: ["sv-SE", "de-DE"] });
    const b = normalizeFilters({ compare: ["de-DE", "sv-SE"] });

    expect(hashKey(queryKeys.keyList(a))).toBe(hashKey(queryKeys.keyList(b)));
  });

  it("separates genuinely different filters", () => {
    const a = normalizeFilters({ locale: "da-DK" });
    const b = normalizeFilters({ locale: "de-DE" });

    expect(hashKey(queryKeys.keyList(a))).not.toBe(hashKey(queryKeys.keyList(b)));
  });

  it("nests list keys under the shared prefix so one invalidation reaches every page", () => {
    const key = queryKeys.keyList(defaultFilters);

    expect(key.slice(0, queryKeys.keys().length)).toEqual([...queryKeys.keys()]);
  });
});

describe("isNavigationalChange", () => {
  it("treats locale, scope and status changes as navigation", () => {
    const base = defaultFilters;

    expect(isNavigationalChange(base, { ...base, locale: "da-DK" })).toBe(true);
    expect(isNavigationalChange(base, { ...base, namespace: "website" })).toBe(true);
    expect(isNavigationalChange(base, { ...base, keyPrefix: "checkout" })).toBe(true);
    expect(isNavigationalChange(base, { ...base, status: "Overridden" })).toBe(true);
  });

  it("treats typing and sorting as a replacement", () => {
    const base = defaultFilters;

    expect(isNavigationalChange(base, { ...base, query: "cart" })).toBe(false);
    expect(isNavigationalChange(base, { ...base, sort: "updatedAt" })).toBe(false);
  });
});
