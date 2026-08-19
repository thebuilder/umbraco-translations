import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocaleFacet, MessageCell, MessageKey, MessageLocaleState } from "../../api/generated/models.js";
import { defaultFilters, type EditorFilters } from "../state/filters.js";
import { KeyGrid } from "./KeyGrid.js";

afterEach(cleanup);

const cell = (locale: string, text: string, state: MessageLocaleState = "Default"): MessageCell => ({
  id: `${locale}-1`,
  locale,
  defaultValue: text,
  overrideValue: state === "Overridden" || state === "NeedsReview" || state === "Removed" ? text : null,
  hasOverride: state !== "Default",
  needsReview: state === "NeedsReview",
  truncated: false,
  state,
  version: null,
  updatedAt: null,
  updatedBy: null,
});

const key = (name: string, cells: MessageKey["cells"]): MessageKey => ({
  sourceId: "s1", namespace: "website", key: name, format: "Icu", arguments: {}, cells, coverage: {},
});

const LOCALES: LocaleFacet[] = [
  { code: "da", name: "Danish", isDefault: false, isConfigured: true, messageCount: 10, overriddenCount: 2, needsReviewCount: 1, absentKeyCount: 1 },
  { code: "en", name: "English", isDefault: true, isConfigured: true, messageCount: 10, overriddenCount: 0, needsReviewCount: 0, absentKeyCount: 0 },
];

const show = (keys: MessageKey[], filters: Partial<EditorFilters> = {}, mode: "search" | "queue" = "search") =>
  render(
    <KeyGrid
      keys={keys}
      filters={{ ...defaultFilters, locale: "da", referenceLocale: "en", ...filters }}
      locales={LOCALES}
      total={keys.length}
      namespaceCount={1}
      mode={mode}
      onSelect={vi.fn()}
      onLoadMore={vi.fn()}
      hasMore={false}
      loadingMore={false}
    />,
  );

/**
 * The status a row carries is the last thing on it and the thing an editor scans a screenful for,
 * so what it says and how loudly it says it is the whole point of the column.
 */
describe("what a row says about itself", () => {
  it("gives the two states that need a decision a badge, and everything ordinary a word", () => {
    const { container } = show([
      key("a", { da: cell("da", "Tekst", "NeedsReview"), en: cell("en", "Text") }),
      key("b", { da: cell("da", "Tekst", "Removed"), en: cell("en", "Text") }),
      key("c", { da: cell("da", "Min tekst", "Overridden"), en: cell("en", "Text") }),
      key("d", { da: cell("da", "Tekst"), en: cell("en", "Text") }),
    ]);

    expect(screen.getByText("App text changed").className).toContain("badge--warning");
    expect(screen.getByText("Gone from app").className).toContain("badge--danger");
    // Custom text is true of a great many rows: spelling it out as loudly as the two above would
    // bury exactly the rows the colour is there to surface.
    expect(container.querySelectorAll(".badge").length).toBe(2);
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(screen.getByText("App text")).toBeTruthy();
  });

  it("offers the way to start on a row with nothing in the language being edited", () => {
    show([key("a", { en: cell("en", "Your basket is empty") })]);

    expect(screen.getByText("Write")).toBeTruthy();
    expect(screen.getByText("Not written in Danish")).toBeTruthy();
  });
});

/**
 * Somebody reports an English sentence and asks for the Danish to be fixed. The row that comes back
 * holds no trace of what they typed unless it says where the hit was.
 */
describe("why a row is a result", () => {
  it("names the language the hit was in when it is not the one leading the row", () => {
    show(
      [key("a", { da: cell("da", "Velkommen tilbage"), en: cell("en", "Welcome back") })],
      { query: "Welcome back" },
    );

    expect(screen.getByText("matched · English")).toBeTruthy();
  });

  it("says the key when that is the only thing the term is in", () => {
    show(
      [key("greeting", { da: cell("da", "Hej"), en: cell("en", "Hi") })],
      { query: "greeting" },
    );

    expect(screen.getByText("matched · the key")).toBeTruthy();
  });

  it("stays quiet when the hit is in the words already shown, which are marked", () => {
    const { container } = show(
      [key("a", { da: cell("da", "Velkommen tilbage"), en: cell("en", "Welcome back") })],
      { query: "Velkommen" },
    );

    expect(container.querySelector(".row__source")).toBeNull();
    expect(container.querySelector(".hit")?.textContent).toBe("Velkommen");
  });

  it("says nothing rather than guessing when the hit is in neither language on screen", () => {
    // The server matches every language it was asked for; inventing an explanation for a hit this
    // client cannot see would be worse than leaving the row unexplained.
    const { container } = show(
      [key("a", { da: cell("da", "Hej"), en: cell("en", "Hi") })],
      { query: "Willkommen" },
    );

    expect(container.querySelector(".row__source")).toBeNull();
  });
});

describe("a language the application ships nothing for", () => {
  it("leads with the text being written from rather than a column of absences", () => {
    const { container } = show(
      [key("a", { en: cell("en", "Your basket is empty") })],
      { locale: "nb", referenceLocale: "en" },
      "queue",
    );

    const row = container.querySelector(".grid__row:not(.grid__row--head)")!;
    const values = [...row.querySelectorAll(".row__value")].map((value) => value.textContent);
    expect(values[0]).toBe("Your basket is empty");
    expect(values[1]).toBe("Not written");
  });
});
