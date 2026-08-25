import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocaleFacet } from "../../api/generated/models.js";
import { defaultFilters, type EditorFilters } from "../state/filters.js";
import { ContextStrip } from "./ContextStrip.js";

afterEach(cleanup);

const locale = (code: string, name: string, overrides: Partial<LocaleFacet> = {}): LocaleFacet => ({
  code, name, isDefault: false, isConfigured: true,
  messageCount: 100, overriddenCount: 10, needsReviewCount: 0, absentKeyCount: 0,
  ...overrides,
});

const strip = (locales: LocaleFacet[], filters: Partial<EditorFilters> = {}, update = vi.fn()) => {
  const result = render(
    <ContextStrip
      filters={{ ...defaultFilters, locale: "en-US", referenceLocale: "en-US", ...filters }}
      locales={locales}
      totalKeys={100}
      mode="search"
      update={update}
    />,
  );
  return { ...result, update };
};

const ONE = [locale("en-US", "English (United States)", { isDefault: true })];
const TWO = [...ONE, locale("da-DK", "Danish")];

/**
 * A site with one language has made no decision for anybody to change. The menu offering it was
 * both pointless and, because of the bug below, unusable -- so this is two faults in one place.
 */
describe("a site with only one language", () => {
  it("states the language instead of offering a menu of one", () => {
    strip(ONE);

    expect(screen.getByText("English (United States)")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Language being edited" })).toBeNull();
  });

  it("says nothing about comparing, because there is nothing to compare against", () => {
    strip(ONE);

    expect(screen.queryByText("compared with")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Language to compare against" })).toBeNull();
  });

  it("still offers the menu once there is a second language", () => {
    strip(TWO);

    expect(screen.getByRole("combobox", { name: "Language being edited" })).toBeTruthy();
    expect(screen.getByText("compared with")).toBeTruthy();
  });

  /*
   * Only the count of languages decides this. Hiding the comparison whenever nothing qualified as
   * one took the whole clause off a site part way through its first synchronization -- several
   * languages, none of them with messages yet -- and left no way to bring it back or see why.
   */
  it("keeps the comparison even when no other language has anything to compare yet", () => {
    strip([...ONE, locale("da-DK", "Danish", { messageCount: 0, overriddenCount: 0 })]);

    expect(screen.getByText("compared with")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Language to compare against" })).toBeTruthy();
  });
});

describe("changing the language being edited", () => {
  it("swaps the pair when the language picked is the one being compared against", () => {
    // Otherwise the two collapse into one, which reads as "no comparison" and takes the reference
    // column away at the moment somebody asked to look at that language. Having asked to edit
    // English while reading Danish, the Danish is what they want beside it.
    const { update } = strip(TWO, { locale: "da-DK", referenceLocale: "en-US" });

    const picker = screen.getByRole("combobox", { name: "Language being edited" });
    fireEvent.change(picker, { target: { value: "en-US" } });

    expect(update).toHaveBeenCalledWith({ locale: "en-US", referenceLocale: "da-DK" });
  });
});

/**
 * The failure this fixes: the server answers with an empty locale until something has been
 * synchronised. A select whose value names none of its options does not sit on nothing -- it shows
 * the first option as though it were chosen, and choosing that option fires no change event at all.
 * So the face said "Choose a language" beside a menu claiming one was already picked, and the
 * language could not be picked.
 */
describe("with no language chosen yet", () => {
  it("puts the control somewhere real, so every language on the list is a change", () => {
    const { update } = strip(TWO, { locale: null, referenceLocale: null });

    const picker = screen.getByRole("combobox", { name: "Language being edited" }) as HTMLSelectElement;
    expect(picker.value).toBe("");
    // The placeholder is where the control is, and it is not somewhere it can be sent back to.
    expect(picker.options[0]!.disabled).toBe(true);

    fireEvent.change(picker, { target: { value: "en-US" } });
    expect(update).toHaveBeenCalledWith({ locale: "en-US", referenceLocale: "en-US" });
  });

  it("says the same thing in the face and in the control", () => {
    strip(TWO, { locale: null, referenceLocale: null });

    // Twice on purpose: the drawn face and the option the select is actually sitting on. They
    // disagreed before, which is what made the menu impossible to read as anything sensible.
    expect(screen.getAllByText("Choose a language")).toHaveLength(2);
    const picker = screen.getByRole("combobox", { name: "Language being edited" }) as HTMLSelectElement;
    expect(picker.selectedOptions[0]?.textContent).toBe("Choose a language");
  });
});
