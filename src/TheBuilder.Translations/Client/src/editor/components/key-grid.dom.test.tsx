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

const show = (keys: MessageKey[], filters: Partial<EditorFilters> = {}, selected?: EditTarget) =>
  render(
    <KeyGrid
      filters={{ ...defaultFilters, locale: "da", referenceLocale: "en", ...filters }}
      hasMore={false}
      keys={keys}
      loadingMore={false}
      locales={LOCALES}
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
  it("badges what needs a decision, gives custom text a word, and says nothing else", () => {
    const { container } = show([
      key("a", { da: cell("da", "Tekst", "NeedsReview"), en: cell("en", "Text") }),
      key("b", { da: cell("da", "Tekst", "Removed"), en: cell("en", "Text") }),
      key("c", { da: cell("da", "Min tekst", "Overridden"), en: cell("en", "Text") }),
      key("d", { da: cell("da", "Tekst"), en: cell("en", "Text") }),
    ]);

    expect(screen.getByText("Default changed").className).toContain("badge--warning");
    expect(screen.getByText("No longer used").className).toContain("badge--danger");
    // Custom text is true of a great many rows: spelling it out as loudly as the two above would
    // bury exactly the rows the colour is there to surface.
    expect(container.querySelectorAll(".badge").length).toBe(2);
    expect(screen.getByText("Custom")).toBeTruthy();
    // Default text says nothing: it is most of any list, and the words beside it are the text.
    expect(container.querySelectorAll(".grid__cell--status")[4]?.textContent).toBe("");
  });

  it("says a row has nothing in the language being edited, in that language's column", () => {
    show([key("a", { en: cell("en", "Your basket is empty") })]);

    // The column heading names the language, so the absence does not have to.
    expect(screen.getByText("Not written")).toBeTruthy();
  });
});

/**
 * Somebody reports an English sentence and asks for the Danish to be fixed. The row that comes back
 * holds no trace of what they typed unless it says where the hit was.
 */
describe("why a row is a result", () => {
  it("lets the highlight say it when the hit is in a column on screen", () => {
    const { container } = show(
      [key("a", { da: cell("da", "Velkommen tilbage"), en: cell("en", "Welcome back") }, ["en"])],
      { query: "Welcome back" }
    );

    expect(container.querySelector(".row__source")).toBeNull();
    expect(container.querySelector(".hit")?.textContent).toBe("Welcome back");
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

describe("marking what the search hit in the key", () => {
  it("shows a namespace the search hit, even where the view leaves namespaces out", () => {
    // Scoped to one namespace the namespace is not drawn, so a hit only in it marked nothing.
    const { container } = render(
      <KeyGrid
        filters={{
          ...defaultFilters,
          locale: "da",
          referenceLocale: "en",
          namespace: "website",
          query: "website",
        }}
        hasMore={false}
        keys={[key("cart.empty", { da: cell("da", "Tom"), en: cell("en", "Empty") })]}
        loadingMore={false}
        locales={LOCALES}
        namespaceCount={1}
        onLoadMore={vi.fn()}
        onSelect={vi.fn()}
        total={1}
      />
    );

    expect(container.querySelector(".row__namespace .hit")?.textContent).toBe("website");
  });

  it("marks a search for the whole dotted key as one piece", () => {
    const { container } = show(
      [key("cart.empty", { da: cell("da", "Tom"), en: cell("en", "Empty") })],
      {
        query: "website.cart.empty",
      }
    );

    expect(container.querySelector(".row__key .hit")?.textContent).toBe("website.cart.empty");
  });
});

describe("a language the application ships nothing for", () => {
  it("keeps the language being edited next to the key, empty as it is", () => {
    // It used to swap with the reference, which put the language somebody had just picked to edit
    // in the second column under a heading they had not chosen.
    const { container } = show([key("a", { en: cell("en", "Your basket is empty") })], {
      locale: "nb",
      referenceLocale: "en",
    });

    const row = container.querySelector(".grid__row:not(.grid__row--head)");
    const values = [...(row?.querySelectorAll(".row__value") ?? [])].map(
      (value) => value.textContent
    );
    expect(values).toEqual(["Not written", "Your basket is empty"]);
  });

  it("leaves a status alone in search mode, where it is the thing worth reading", () => {
    // Opening a row must not take its badge away: that badge is why the row was opened.
    show(
      [key("a", { da: cell("da", "Tekst", "NeedsReview"), en: cell("en", "Text") })],
      {},
      { sourceId: "s1", namespace: "website", key: "a", locale: "da" }
    );

    expect(screen.getByText("Default changed")).toBeTruthy();
  });
});

/**
 * The row a translation is open on has to stay findable in the list: scrolling away and back, or
 * saving while the order is by what changed last, is how you end up looking at a screenful of rows
 * with no idea which one is being edited.
 */
describe("the row a translation is open on", () => {
  it("marks it without taking the row's own layout with it", () => {
    // Both classes, not one: the modifier carries the tint and the bar, and `grid__row` is what
    // makes a row a row. Written as one string with the space left out, the marked row lost its
    // grid entirely and stacked its columns on top of each other.
    const { container } = show(
      [key("a", { da: cell("da", "Hej"), en: cell("en", "Hi") })],
      {},
      {
        sourceId: "s1",
        namespace: "website",
        key: "a",
        locale: "da",
      }
    );

    const open = container.querySelector('[role="row"][aria-selected="true"]');
    expect(open?.classList.contains("grid__row")).toBe(true);
    expect(open?.classList.contains("grid__row--selected")).toBe(true);
  });

  it("marks nothing while no translation is open", () => {
    const { container } = show([key("a", { da: cell("da", "Hej"), en: cell("en", "Hi") })]);

    expect(container.querySelector(".grid__row--selected")).toBeNull();
  });
});
