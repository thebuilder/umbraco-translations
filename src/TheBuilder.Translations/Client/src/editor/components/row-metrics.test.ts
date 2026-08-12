import { describe, expect, it } from "vitest";
import type { MessageKey } from "../../api/generated/models.js";
import { normalizeFilters } from "../state/filters.js";
import { displayKey } from "./row-metrics.js";

const key = (name: string, namespace = "website"): MessageKey => ({
  sourceId: "source-1",
  namespace,
  key: name,
  format: "Icu",
  arguments: {},
  cells: {},
  coverage: {},
});

const scope = (namespace: string | null, keyPrefix: string | null) =>
  normalizeFilters({ namespace, keyPrefix });

describe("displayKey", () => {
  it("shows the namespace only when it still says something", () => {
    // Scoped to one namespace, so repeating it on every row is noise.
    expect(displayKey(key("cart.empty"), scope("website", null), 3).showNamespace).toBe(false);
    // Unscoped across several namespaces, so it distinguishes rows.
    expect(displayKey(key("cart.empty"), scope(null, null), 3).showNamespace).toBe(true);
    // Unscoped but only one namespace exists, so it distinguishes nothing.
    expect(displayKey(key("cart.empty"), scope(null, null), 1).showNamespace).toBe(false);
  });

  it("strips the scoped prefix from the key", () => {
    const shown = displayKey(key("checkout.errors.declined"), scope("website", "checkout.errors"), 1);

    expect(shown.text).toBe("declined");
    expect(shown.elided).toBe(true);
  });

  it("leaves a key that only resembles the prefix alone", () => {
    // "cartography.title" starts with the same characters as "cart" but is a different subtree, so
    // slicing by length would produce "ography.title".
    const shown = displayKey(key("cartography.title"), scope("website", "cart"), 1);

    expect(shown.text).toBe("cartography.title");
    expect(shown.elided).toBe(false);
  });

  it("leaves the key whole when nothing is scoped", () => {
    const shown = displayKey(key("cart.empty"), scope(null, null), 1);

    expect(shown.text).toBe("cart.empty");
    expect(shown.elided).toBe(false);
  });
});
