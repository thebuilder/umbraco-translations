import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageDetail } from "../../api/generated/models.js";
import { TranslationDetail } from "./TranslationDetail.js";

vi.mock("../../api/generated/client.js", () => ({
  api: {
    message: vi.fn(async () => detail),
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

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

type Props = Parameters<typeof TranslationDetail>[0];

const open = (canEdit: boolean, props: Partial<Props> = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TranslationDetail
        id="m1"
        bridge={{ notify: vi.fn() } as never}
        canEdit={canEdit}
        onKeepEditing={() => {}}
        onDiscard={() => {}}
        onDirtyChange={() => {}}
        select={() => {}}
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
    expect(screen.getByRole("button", { name: "Reset to application text" })).toBeTruthy();
  });

  it("shows the custom text but no way to change it without permission", async () => {
    const { container } = open(false);

    // Scoped to the custom-text block, because the drawer heading is the effective value and so
    // carries the same words.
    await waitFor(() => {
      const custom = [...container.querySelectorAll<HTMLElement>(".block")]
        .find((block) => block.querySelector("h3")?.textContent?.startsWith("Custom"));
      expect(custom?.querySelector(".reading")?.textContent).toBe("Kurven er tom");
    });

    // The point of the test: the API refuses the write either way, so the only thing a field and a
    // Save button could do here is waste the work someone typed into them.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save & next" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset to application text" })).toBeNull();
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
    // close button both silently doing nothing and no way out of the drawer at all.
    expect(await screen.findByRole("button", { name: "Discard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeTruthy();
    expect(screen.getByText("Close without saving your changes?")).toBeTruthy();
  });

  it("says which way out is being asked about", async () => {
    open(true, { pending: "m2" });

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
