import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LocaleFacet,
  MessageCell,
  MessageKey,
  MessageLocaleState,
} from "../../api/generated/models.js";
import { defaultFilters, type EditorFilters } from "../state/filters.js";
import type { EditTarget } from "../state/target.js";
import { KeyGrid } from "./key-grid.js";

afterEach(cleanup);

const cell = (
  locale: string,
  text: string,
  state: MessageLocaleState = "Default"
): MessageCell => ({
  id: `${locale}-1`,
  locale,
  defaultValue: text,
  overrideValue:
    state === "Overridden" || state === "NeedsReview" || state === "Removed" ? text : null,
  hasOverride: state !== "Default",
  needsReview: state === "NeedsReview",
  truncated: false,
  state,
  version: null,
  updatedAt: null,
  updatedBy: null,
});

/**
 * `matchedLocales` is the server's own answer about where the search hit, so a fixture that has a
 * term in its text has to say so here too -- an empty list is the server saying no language
 * matched, not the server saying nothing.
 */
const key = (
  name: string,
  cells: MessageKey["cells"],
  matchedLocales: string[] = []
): MessageKey => ({
  sourceId: "s1",
  namespace: "website",
  key: name,
  format: "Icu",
  arguments: {},
  cells,
  coverage: {},
  matchedLocales,
});

const LOCALES: LocaleFacet[] = [
  {
    code: "da",
    name: "Danish",
    isDefault: false,
    isConfigured: true,
    messageCount: 10,
    overriddenCount: 2,
    needsReviewCount: 1,
    absentKeyCount: 1,
  },
  {
    code: "en",
    name: "English",
    isDefault: true,
    isConfigured: true,
    messageCount: 10,
    overriddenCount: 0,
    needsReviewCount: 0,
    absentKeyCount: 0,
  },
  // Neither edited nor compared: the language a row can only be a result because of.
  {
    code: "de",
    name: "German",
    isDefault: false,
    isConfigured: true,
    messageCount: 10,
    overriddenCount: 0,
    needsReviewCount: 0,
    absentKeyCount: 0,
  },
];

const show = (
  keys: MessageKey[],
  filters: Partial<EditorFilters> = {},
  mode: "search" | "queue" = "search",
  selected?: EditTarget
) =>
  render(
    <KeyGrid
      filters={{ ...defaultFilters, locale: "da", referenceLocale: "en", ...filters }}
      hasMore={false}
      keys={keys}
      loadingMore={false}
      locales={LOCALES}
      mode={mode}
      namespaceCount={1}
      onLoadMore={vi.fn()}
      onSelect={vi.fn()}
      selected={selected}
      total={keys.length}
    />
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
      [key("a", { da: cell("da", "Velkommen tilbage"), en: cell("en", "Welcome back") }, ["en"])],
      { query: "Welcome back" }
    );

    expect(screen.getByText("matched in English")).toBeTruthy();
  });

  it("says the key when that is the only thing the term is in", () => {
    show([key("greeting", { da: cell("da", "Hej"), en: cell("en", "Hi") })], { query: "greeting" });

    expect(screen.getByText("matched in the key")).toBeTruthy();
  });

  it("stays quiet when the hit is in the words already shown, which are marked", () => {
    const { container } = show(
      [key("a", { da: cell("da", "Velkommen tilbage"), en: cell("en", "Welcome back") }, ["da"])],
      { query: "Velkommen" }
    );

    expect(container.querySelector(".row__source")).toBeNull();
    expect(container.querySelector(".hit")?.textContent).toBe("Velkommen");
  });

  it("names a language with no column at all, because the server says which one", () => {
    // The row this feature exists for: the words in both columns look unrelated to what was typed,
    // and the only thing that can explain it is the language nobody is looking at.
    show([key("a", { da: cell("da", "Hej"), en: cell("en", "Hi") }, ["de"])], {
      query: "Willkommen",
    });

    expect(screen.getByText("matched in German")).toBeTruthy();
  });

  it("names all of them when the sentence turns up in more than one", () => {
    show([key("a", { da: cell("da", "Hej"), en: cell("en", "Hi") }, ["de", "sv"])], {
      query: "Willkommen",
    });

    // No facet for Swedish here, so it falls back to the code rather than dropping the language.
    expect(screen.getByText("matched in German and sv")).toBeTruthy();
  });
});

describe("a language the application ships nothing for", () => {
  it("leads with the text being written from rather than a column of absences", () => {
    const { container } = show(
      [key("a", { en: cell("en", "Your basket is empty") })],
      { locale: "nb", referenceLocale: "en" },
      "queue"
    );

    const row = container.querySelector(".grid__row:not(.grid__row--head)");
    expect(row).not.toBeNull();
    const values = [...(row?.querySelectorAll(".row__value") ?? [])].map(
      (value) => value.textContent
    );
    expect(values[0]).toBe("Your basket is empty");
    expect(values[1]).toBe("Not written");
  });

  /*
   * Every row of a queue says the same two things, so the row being worked on has to say something
   * else or there is nothing on a screenful of identical offers to mark where you are -- and the
   * one offer that is no longer an offer is the one already taken.
   */
  it("says which row is being written rather than offering to start it again", () => {
    const rows = [
      key("a", { en: cell("en", "Your basket is empty") }),
      key("b", { en: cell("en", "Continue to checkout") }),
    ];

    show(rows, { locale: "nb", referenceLocale: "en" }, "queue", {
      sourceId: "s1",
      namespace: "website",
      key: "a",
      locale: "nb",
    });

    expect(screen.getByText("Writing now…")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    // The row beside it is untouched: only the open one changes what it says.
    expect(screen.getByText("Not written")).toBeTruthy();
    expect(screen.getByText("Write")).toBeTruthy();
  });

  it("leaves a status alone in search mode, where it is the thing worth reading", () => {
    // Opening a row must not take its badge away: that badge is why the row was opened.
    show(
      [key("a", { da: cell("da", "Tekst", "NeedsReview"), en: cell("en", "Text") })],
      {},
      "search",
      { sourceId: "s1", namespace: "website", key: "a", locale: "da" }
    );

    expect(screen.getByText("App text changed")).toBeTruthy();
  });
});
