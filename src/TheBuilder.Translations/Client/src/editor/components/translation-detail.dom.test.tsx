import { EditorView } from "@codemirror/view";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocaleFacet, MessageDetail, MessageKey } from "../../api/generated/models.js";
import type { EditTarget } from "../state/target.js";
import { TranslationDetail } from "./translation-detail.js";

vi.mock("../../api/generated/client.js", () => ({
  api: {
    message: vi.fn(async () => detail),
    messageKeys: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 50,
      total: 0,
      referenceLocale: "en",
      targetLocale: "da",
      compareLocales: [],
    })),
    saveOverride: vi.fn(async (request: { value: string }) => ({
      ...detail,
      overrideValue: request.value,
    })),
    resetOverride: vi.fn(async () => undefined),
  },
}));

const detail: MessageDetail = {
  id: "m1",
  sourceId: "s1",
  namespace: "website",
  key: "cart.empty",
  locale: "da",
  defaultValue: "Din kurv er tom",
  overrideValue: "Kurven er tom",
  format: "Icu",
  arguments: {},
  needsReview: false,
  state: "Overridden",
  sourceRevision: "rev",
  defaultChecksum: "sum",
  version: 1,
  updatedAt: null,
  updatedBy: null,
};

const target: EditTarget = {
  sourceId: "s1",
  namespace: "website",
  key: "cart.empty",
  locale: "da",
};

const locale = (code: string, name: string, overrides: Partial<LocaleFacet> = {}): LocaleFacet => ({
  code,
  name,
  isDefault: false,
  isConfigured: true,
  messageCount: 100,
  overriddenCount: 10,
  needsReviewCount: 0,
  absentKeyCount: 0,
  ...overrides,
});

/** A row as the list holds it: the language being edited, and the one it is compared with. */
const row = (cells: MessageKey["cells"]): MessageKey => ({
  sourceId: "s1",
  namespace: "website",
  key: "cart.empty",
  format: "Icu",
  arguments: {},
  cells,
  coverage: {},
  matchedLocales: [],
});

const written = row({
  da: {
    id: "m1",
    locale: "da",
    defaultValue: "Din kurv er tom",
    overrideValue: "Kurven er tom",
    hasOverride: true,
    needsReview: false,
    truncated: false,
    state: "Overridden",
    version: 1,
    updatedAt: null,
    updatedBy: null,
  },
  en: {
    id: "m2",
    locale: "en",
    defaultValue: "Your basket is empty",
    overrideValue: null,
    hasOverride: false,
    needsReview: false,
    truncated: false,
    state: "Default",
    version: null,
    updatedAt: null,
    updatedBy: null,
  },
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

type Props = Parameters<typeof TranslationDetail>[0];

const open = (canEdit: boolean, props: Partial<Props> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TranslationDetail
        bridge={{ notify: vi.fn() } as never}
        canEdit={canEdit}
        close={vi.fn()}
        locales={[locale("da", "Danish"), locale("en", "English")]}
        mode="search"
        onDiscard={vi.fn()}
        onDraftChange={vi.fn()}
        onKeepEditing={vi.fn()}
        row={written}
        select={vi.fn()}
        target={target}
        {...props}
      />
    </QueryClientProvider>
  );
};

/** The editor behind a field. The field is CodeMirror, so its text is its document, not a value. */
const fieldView = (field: HTMLElement): EditorView => {
  const view = EditorView.findFromDOM(field);
  if (!view) {
    throw new Error("The field is not an editor.");
  }
  return view;
};

const fieldText = (field: HTMLElement) => fieldView(field).state.doc.toString();

const pressEscape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

describe("TranslationDetail permissions", () => {
  it("offers the field and the actions to someone who may edit", async () => {
    open(true);

    expect(await screen.findByRole("textbox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revert to the default text" })).toBeTruthy();
  });

  it("shows the custom text but no way to change it without permission", async () => {
    const { container } = open(false);

    // Scoped to the reading of the editor's own text: the application's text is on the same
    // screen, and the words are close enough to catch the wrong one.
    await waitFor(() => {
      expect(container.querySelector(".editor__own")?.textContent).toBe("Kurven er tom");
    });

    // The point of the test: the API refuses the write either way, so the only thing a field and a
    // Save button could do here is waste the work someone typed into them.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save & next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revert to the default text" })).toBeNull();
    expect(screen.getByText("You have view-only access to translations.")).toBeTruthy();
  });

  it("still lets a view-only reader close the editor", async () => {
    open(false);

    expect(await screen.findByRole("button", { name: "Close editor" })).toBeTruthy();
  });
});

describe("coming back to a translation", () => {
  it("starts from the unsaved text left in it, rather than from what is saved", async () => {
    open(true, { initialDraft: "Kurven er næsten tom" });

    const field = await screen.findByRole("textbox");
    await waitFor(() => expect(fieldText(field)).toBe("Kurven er næsten tom"));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
  });

  it("does not take focus when it was not opened on purpose", async () => {
    // Its row scrolling back into view, or returning to a search result, is not somebody opening
    // it; taking the caret out of the search box then is stealing it.
    const search = document.createElement("input");
    document.body.append(search);
    search.focus();

    open(true, { claimFocus: () => false });
    await screen.findByRole("textbox");

    expect(document.activeElement).toBe(search);
    search.remove();
  });
});

describe("leaving with unsaved text", () => {
  it("asks in the footer rather than through a dialog that may never appear", async () => {
    open(true, { pending: "close" });

    // The native confirm() this replaced returned false when suppressed, which left Escape and the
    // close button both silently doing nothing and no way out of the editor at all.
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

    pressEscape();

    // Escape is what got them here, so it must not also be what throws the text away.
    expect(onKeepEditing).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });

  it("closes on Escape when there is nothing to lose", async () => {
    const close = vi.fn();
    open(true, { close });
    await screen.findByRole("textbox");

    pressEscape();

    expect(close).toHaveBeenCalledOnce();
  });
});

/**
 * The editor puts the caret straight into the field, so a bare arrow belongs to the text. Without a
 * way past that, a keyboard user who opened a search result could only get to the next one by
 * closing the editor, and could not get back to the previous one at all.
 */
describe("moving between translations from the field", () => {
  const previous: EditTarget = { ...target, key: "cart.total" };
  const nextOne: EditTarget = { ...target, key: "cart.checkout" };

  const press = (key: string, init: object = {}) =>
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
    });

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
    // Nowhere to go, so the field keeps whatever the platform does with it rather than the editor
    // eating a keypress and doing nothing visible with it.
    const select = vi.fn();
    open(true, { select });
    await screen.findByRole("textbox");

    let defaultPrevented = false;
    const watch = ({ defaultPrevented: prevented }: KeyboardEvent) => {
      defaultPrevented = prevented;
    };
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

describe("saving from the keyboard", () => {
  const type = async (text: string) => {
    const field = await screen.findByRole("textbox");
    act(() => {
      fieldView(field).dispatch({
        changes: { from: 0, to: fieldView(field).state.doc.length, insert: text },
      });
    });
    return field;
  };

  it("saves on Ctrl/Cmd+Enter, because Enter alone belongs to the text", async () => {
    const close = vi.fn();
    open(true, { close });
    const field = await type("Kurven er helt tom");

    act(() => {
      fireEvent.keyDown(field, { key: "Enter", bubbles: true });
    });
    expect(close).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true })
      );
    });
    await waitFor(() => expect(close).toHaveBeenCalled());
  });

  it("still saves on Ctrl/Cmd+S", async () => {
    const close = vi.fn();
    open(true, { close });
    await type("Kurven er helt tom");

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      );
    });

    await waitFor(() => expect(close).toHaveBeenCalled());
  });
});

/**
 * The job the old editor could not do at all: a language the applications ship nothing for has no
 * message row and therefore no id, and an editor addressed by id had no way to open on one.
 */
describe("a translation that does not exist yet", () => {
  const empty = row({
    en: {
      id: "m2",
      locale: "en",
      defaultValue: "Your basket is empty",
      overrideValue: null,
      hasOverride: false,
      needsReview: false,
      truncated: false,
      state: "Default",
      version: null,
      updatedAt: null,
      updatedBy: null,
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

    const field = await screen.findByRole("textbox");
    expect(fieldText(field)).toBe("");
    expect(screen.getByText("Nothing written here yet")).toBeTruthy();
  });

  it("leads with the text being written from, because that is what there is to read", async () => {
    const { container } = queue();
    await screen.findByRole("textbox");

    // The reference reading comes before the field in the document, which is the reading order the
    // work happens in when there is nothing to correct yet.
    const lead = container.querySelector(".code--readonly");
    const field = container.querySelector(".cm-content");
    expect(lead?.textContent).toBe("Your basket is empty");
    expect(field && lead?.compareDocumentPosition(field)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("offers the reference as a starting point rather than an empty box", async () => {
    queue();
    const field = await screen.findByRole("textbox");

    screen.getByRole("button", { name: "Copy English in" }).click();

    await waitFor(() => expect(fieldText(field)).toBe("Your basket is empty"));
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
