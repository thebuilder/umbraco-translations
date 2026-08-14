import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessageDetail } from "../../api/generated/models.js";
import { TranslationDetail } from "./TranslationDetail.js";

vi.mock("../../api/generated/client.js", () => ({
  api: { message: vi.fn(async () => detail) },
}));

const detail: MessageDetail = {
  id: "m1", sourceId: "s1", namespace: "website", key: "cart.empty", locale: "da",
  defaultValue: "Din kurv er tom", overrideValue: "Kurven er tom",
  format: "Icu", arguments: {}, needsReview: false, state: "Overridden",
  sourceRevision: "rev", defaultChecksum: "sum", version: 1, updatedAt: null, updatedBy: null,
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const open = (canEdit: boolean) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TranslationDetail
        id="m1"
        bridge={{ notify: vi.fn() } as never}
        canEdit={canEdit}
        onDirtyChange={() => {}}
        select={() => {}}
        close={() => {}}
      />
    </QueryClientProvider>,
  );
};

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
