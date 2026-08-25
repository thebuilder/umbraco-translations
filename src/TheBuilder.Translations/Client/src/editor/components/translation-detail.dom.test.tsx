import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocaleFacet, MessageDetail, MessageKey } from "../../api/generated/models.js";
import * as client from "../../api/generated/client.js";
import type { EditTarget } from "../state/target.js";
import { TranslationDetail } from "./TranslationDetail.js";

vi.mock("../../api/generated/client.js", () => ({
  api: {
    message: vi.fn(async () => detail),
    messageKeys: vi.fn(async () => ({
      items: [], page: 1, pageSize: 50, total: 0, referenceLocale: "en", targetLocale: "da", compareLocales: [],
    })),
    saveOverride: vi.fn(async (request: { value: string }) => ({ ...detail, overrideValue: request.value })),
    resetOverride: vi.fn(async () => undefined),
  },
}));

const detail: MessageDetail = {
  id: "m1", sourceId: "s1", namespace: "website", key: "cart.empty", locale: "da",
  defaultValue: "Din kurv er tom", overrideValue: "Kurven er tom",
  format: "Icu", arguments: {}, needsReview: false, state: "Overridden",
  sourceRevision: "rev", defaultChecksum: "sum", version: 1, updatedAt: null, updatedBy: null,
};

const target: EditTarget = { sourceId: "s1", namespace: "website", key: "cart.empty", locale: "da" };

const locale = (code: string, name: string, overrides: Partial<LocaleFacet> = {}): LocaleFacet => ({
  code, name, isDefault: false, isConfigured: true,
  messageCount: 100, overriddenCount: 10, needsReviewCount: 0, absentKeyCount: 0,
  ...overrides,
});

/** A row as the list holds it: the language being edited, and the one it is compared with. */
const row = (cells: MessageKey["cells"]): MessageKey => ({
  sourceId: "s1", namespace: "website", key: "cart.empty",
  format: "Icu", arguments: {}, cells, coverage: {},
  matchedLocales: [],
});

const written = row({
  da: {
    id: "m1", locale: "da", defaultValue: "Din kurv er tom", overrideValue: "Kurven er tom",
    hasOverride: true, needsReview: false, truncated: false, state: "Overridden",
    version: 1, updatedAt: null, updatedBy: null,
  },
  en: {
    id: "m2", locale: "en", defaultValue: "Your basket is empty", overrideValue: null,
    hasOverride: false, needsReview: false, truncated: false, state: "Default",
    version: null, updatedAt: null, updatedBy: null,
  },
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type Props = Parameters<typeof TranslationDetail>[0];

const open = (canEdit: boolean, props: Partial<Props> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TranslationDetail
        target={target}
        row={written}
        bridge={{ notify: vi.fn() } as never}
        locales={[locale("da", "Danish"), locale("en", "English")]}
        mode="search"
        term=""
        canEdit={canEdit}
        onKeepEditing={() => {}}
        onDiscard={() => {}}
        onDirtyChange={() => {}}
        select={() => {}}
        switchLocale={() => {}}
        close={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  );
};

const escape = () =>
  act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });

describe("TranslationDetail permissions", () => {
  it("offers the field and the actions to someone who may edit", async () => {
    open(true);

    expect(await screen.findByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revert to the application text" })).toBeTruthy();
  });

  it("shows the custom text but no way to change it without permission", async () => {
    const { container } = open(false);

    // Scoped to the block holding the editor's own text: the application's text is in a block of
    // its own on the same screen, and the words are close enough to catch the wrong one.
    await waitFor(() => {
      const own = [...container.querySelectorAll<HTMLElement>(".pane__block")]
        .find((block) => block.querySelector("h3")?.textContent?.includes("your text"));
      expect(own?.querySelector(".pane__reading")?.textContent).toBe("Kurven er tom");
    });

    // The point of the test: the API refuses the write either way, so the only thing a field and a
    // Save button could do here is waste the work someone typed into them.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save & next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert to the application text" })).toBeNull();
    expect(screen.getByText("You have view-only access to translations.")).toBeTruthy();
  });

  it("still lets a view-only reader close the editor", async () => {
    open(false);

    expect(await screen.findByRole("button", { name: "Close editor" })).toBeTruthy();
  });
});

describe("leaving with unsaved text", () => {
  it("asks in the footer rather than through a dialog that may never appear", async () => {
    open(true, { pending: "close" });

    // The native confirm() this replaced returned false when suppressed, which left Escape and the
    // close button both silently doing nothing and no way out of the pane at all.
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeTruthy();
    expect(screen.getByText("Close without saving your changes?")).toBeTruthy();
  });

  it("says which way out is being asked about", async () => {
    open(true, { pending: { ...target, key: "cart.checkout" } });

    expect(await screen.findByText("Open another translation without saving?")).toBeTruthy();
  });

  it("answers the question with Escape instead of closing over it", async () => {
    const close = vi.fn();
    const onKeepEditing = vi.fn();
    open(true, { pending: "close", close, onKeepEditing });
    await screen.findByRole("button", { name: "Discard" });

    escape();

    // Escape is what got them here, so it must not also be what throws the text away.
    expect(onKeepEditing).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes on Escape when there is nothing to lose", async () => {
    const close = vi.fn();
    open(true, { close });
    await screen.findByRole("textbox");

    escape();

    expect(close).toHaveBeenCalledOnce();
  });
});

/**
 * The pane puts the caret straight into the field, so a bare arrow belongs to the text. Without a
 * way past that, a keyboard user who opened a search result could only get to the next one by
 * closing the pane, and could not get back to the previous one at all.
 */
describe("moving between translations from the field", () => {
  const previous: EditTarget = { ...target, key: "cart.total" };
  const nextOne: EditTarget = { ...target, key: "cart.checkout" };

  const press = (key: string, init: object = {}) =>
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init })); });

  it("moves on Ctrl/Cmd and an arrow", async () => {
    const select = vi.fn();
    open(true, { select, previous, next: nextOne });
    await screen.findByRole("textbox");

    press("ArrowDown", { metaKey: true });
    expect(select).toHaveBeenCalledWith(nextOne);

    press("ArrowUp", { ctrlKey: true });
    expect(select).toHaveBeenLastCalledWith(previous);
  });

  it("leaves a bare arrow to the text, which is what the caret is in", async () => {
    const select = vi.fn();
    open(true, { select, previous, next: nextOne });
    await screen.findByRole("textbox");

    press("ArrowDown");
    press("ArrowUp");

    expect(select).not.toHaveBeenCalled();
  });

  it("does not swallow the keystroke at either end of the result", async () => {
    // Nowhere to go, so the field keeps whatever the platform does with it rather than the pane
    // eating a keypress and doing nothing visible with it.
    const select = vi.fn();
    open(true, { select });
    await screen.findByRole("textbox");

    let defaultPrevented = false;
    const watch = (event: KeyboardEvent) => { defaultPrevented = event.defaultPrevented; };
    window.addEventListener("keydown", watch);
    press("ArrowDown", { metaKey: true });
    window.removeEventListener("keydown", watch);

    expect(select).not.toHaveBeenCalled();
    expect(defaultPrevented).toBe(false);
  });

  it("stays put while it is asking about unsaved text", async () => {
    // The question has two answers and neither of them is "somewhere else entirely".
    const select = vi.fn();
    open(true, { select, next: nextOne, pending: "close" });
    await screen.findByRole("button", { name: "Discard" });

    press("ArrowDown", { metaKey: true });

    expect(select).not.toHaveBeenCalled();
  });
});

/**
 * The section that answers what a two-language list cannot: is the wording wrong everywhere, or
 * only in the one being edited.
 */
describe("the key in every language", () => {
  const withCells = () => {
    const api = vi.mocked(client.api);
    api.messageKeys.mockResolvedValue({
      items: [{
        sourceId: "s1", namespace: "website", key: "cart.empty", format: "Icu", arguments: {},
        coverage: {}, matchedLocales: [],
        cells: {
          da: written.cells.da!,
          en: written.cells.en!,
        },
      }],
      page: 1, pageSize: 50, total: 1, referenceLocale: "en", targetLocale: "da", compareLocales: [],
    } as never);
    return api;
  };

  it("lists the languages the key has never been written in, not only the ones it has", async () => {
    // Half the answer is which languages still need it, and a list of the ones that already have
    // it cannot be read backwards to give that.
    withCells();
    open(true, { locales: [locale("da", "Danish"), locale("en", "English"), locale("de", "German")] });

    expect(await screen.findByText("This key in every language")).toBeTruthy();
    expect(screen.getByText("German")).toBeTruthy();
    expect(screen.getByText("Not written")).toBeTruthy();
    expect(screen.getByText("3 languages · 1 not written")).toBeTruthy();
  });

  it("is still there when no comparison language is chosen", async () => {
    // Passing no locale pair disabled the query outright, and a disabled query is not loading, so
    // the whole section rendered as nothing at all for anyone not comparing against a second one.
    const api = withCells();
    open(true, { reference: undefined });

    expect(await screen.findByText("This key in every language")).toBeTruthy();
    const query = api.messageKeys.mock.calls[0]![0] as { locale: string; referenceLocale: string };
    expect(query.locale).toBe("da");
    expect(query.referenceLocale).toBe("da");
  });
});

describe("saving from the keyboard", () => {
  const type = async (text: string) => {
    const field = await screen.findByRole("textbox");
    act(() => { fireEvent.change(field, { target: { value: text } }); });
    return field;
  };

  it("saves on Ctrl/Cmd+Enter, because Enter alone belongs to the text", async () => {
    const close = vi.fn();
    open(true, { close });
    const field = await type("Kurven er helt tom");

    act(() => { fireEvent.keyDown(field, { key: "Enter", bubbles: true }); });
    expect(close).not.toHaveBeenCalled();

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })); });
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it("still saves on Ctrl/Cmd+S", async () => {
    const close = vi.fn();
    open(true, { close });
    await type("Kurven er helt tom");

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })); });

    await waitFor(() => expect(close).toHaveBeenCalled());
  });
});

/**
 * The job the old editor could not do at all: a language the applications ship nothing for has no
 * message row and therefore no id, and a pane addressed by id had no way to open on one.
 */
describe("a translation that does not exist yet", () => {
  const empty = row({
    en: {
      id: "m2", locale: "en", defaultValue: "Your basket is empty", overrideValue: null,
      hasOverride: false, needsReview: false, truncated: false, state: "Default",
      version: null, updatedAt: null, updatedBy: null,
    },
  });

  const queue = (props: Partial<Props> = {}) =>
    open(true, {
      row: empty,
      target: { ...target, locale: "nb" },
      locales: [locale("nb", "Norwegian", { messageCount: 0 }), locale("en", "English")],
      reference: { locale: "en", name: "English" },
      mode: "queue",
      ...props,
    });

  it("opens on it and offers an empty field rather than nothing at all", async () => {
    queue();

    const field = await screen.findByRole("textbox") as HTMLTextAreaElement;
    expect(field.value).toBe("");
    expect(screen.getByText("Nothing written here yet")).toBeTruthy();
  });

  it("leads with the text being written from, because that is what there is to read", async () => {
    const { container } = queue();
    await screen.findByRole("textbox");

    // The reference reading comes before the field in the document, which is the reading order the
    // work happens in when there is nothing to correct yet.
    const lead = container.querySelector(".pane__reading--lead");
    expect(lead?.textContent).toBe("Your basket is empty");
    expect(lead!.compareDocumentPosition(container.querySelector("textarea")!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("offers the reference as a starting point rather than an empty box", async () => {
    queue();
    const field = await screen.findByRole("textbox") as HTMLTextAreaElement;

    screen.getByRole("button", { name: "Copy English in" }).click();

    await waitFor(() => expect(field.value).toBe("Your basket is empty"));
  });

  /*
   * A different question from the one the search job asks. Nobody authoring Norwegian from English
   * wonders which languages still need this key -- every one of them does, that is what the queue is
   * -- they wonder how the others worded it. So it is a reading, and only of the ones there is
   * something to read in.
   */
  it("shows how the other languages worded it, and offers nowhere to go", async () => {
    const swedish = {
      ...written.cells.da!, id: "m3", locale: "sv",
      defaultValue: "Varukorgen är tom", overrideValue: "Varukorgen är tom",
    };
    vi.mocked(client.api).messageKeys.mockResolvedValue({
      items: [{
        sourceId: "s1", namespace: "website", key: "cart.empty", format: "Icu", arguments: {},
        coverage: {}, matchedLocales: [],
        cells: { en: empty.cells.en!, da: written.cells.da!, sv: swedish },
      }],
      page: 1, pageSize: 50, total: 1, referenceLocale: "en", targetLocale: "nb", compareLocales: [],
    } as never);

    const { container } = queue({
      locales: [
        locale("nb", "Norwegian", { messageCount: 0 }),
        locale("en", "English"),
        locale("da", "Danish"),
        locale("sv", "Swedish"),
        locale("de", "German"),
      ],
    });

    expect(await screen.findByText("Same key elsewhere")).toBeTruthy();

    // Not the two already on screen above it, and not the ones with nothing to read.
    const named = [...container.querySelectorAll(".elsewhere dt")].map((term) => term.textContent);
    expect(named).toEqual(["Danish", "Swedish"]);
    expect(screen.getByText("Varukorgen är tom")).toBeTruthy();

    // And nothing to click: leaving the queue to correct Danish is an offer to lose your place.
    expect(screen.queryByRole("button", { name: /^Edit this key in/ })).toBeNull();
  });

  it("ends on the next item, because a queue is worked down rather than closed", async () => {
    queue({ next: { ...target, locale: "nb", key: "cart.checkout" } });
    await screen.findByRole("textbox");

    // Save is not offered as the primary here: nobody opens the second of nine hundred rows
    // intending to go back to the list afterwards.
    expect(screen.getByRole("button", { name: "Save & next" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
