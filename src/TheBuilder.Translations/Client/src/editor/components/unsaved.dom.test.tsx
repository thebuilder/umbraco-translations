import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { api } from "../../api/generated/client.js";
import { useSaveDrafts } from "../api/save-drafts.js";
import { createDraftStore } from "../state/drafts.js";
import { type EditTarget, targetId } from "../state/target.js";
import { UnsavedActions, UnsavedContext, UnsavedValue } from "./unsaved.js";

vi.mock("../../api/generated/client.js", () => ({ api: { saveOverride: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.mocked(api.saveOverride).mockReset();
});

const target = (key: string): EditTarget => ({
  sourceId: "s1",
  namespace: "web",
  key,
  locale: "da",
});

describe("a row with unsaved text", () => {
  const row = (save = vi.fn()) => {
    const drafts = createDraftStore(null);
    drafts.set(target("pay"), "Betal nu", 4);
    // The grid row opens on click; a listener above the app stands in for it.
    const opened = vi.fn();
    document.addEventListener("click", opened);
    render(
      <UnsavedContext value={{ drafts, save, saving: false, canEdit: true }}>
        <span>
          <UnsavedValue target={target("pay")}>Betal</UnsavedValue>
        </span>
        <span>
          <UnsavedActions target={target("pay")}>Custom</UnsavedActions>
        </span>
      </UnsavedContext>
    );
    onTestFinished(() => document.removeEventListener("click", opened));
    return { drafts, save, opened };
  };

  it("shows the unsaved text rather than what is saved", () => {
    row();

    expect(screen.getByText("Betal nu")).toBeTruthy();
    expect(screen.queryByText("Custom")).toBeNull();
  });

  it("saves from the row, with the version it was written against, without opening it", () => {
    const { save, opened } = row();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledWith({ target: target("pay"), text: "Betal nu", version: 4 });
    expect(opened).not.toHaveBeenCalled();
  });

  it("throws the text away from the row, back to what is saved", () => {
    const { drafts, opened } = row();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(drafts.has(targetId(target("pay")))).toBe(false);
    expect(screen.getByText("Custom")).toBeTruthy();
    expect(opened).not.toHaveBeenCalled();
  });
});

describe("saving several at once", () => {
  it("forgets the ones that saved and keeps the ones that did not, saying which", async () => {
    vi.mocked(api.saveOverride).mockImplementation((body) =>
      body.key === "bad"
        ? Promise.reject(new Error("The override must use the same argument names."))
        : Promise.resolve({ id: `id-${body.key}` } as never)
    );
    const drafts = createDraftStore(null);
    drafts.set(target("good"), "Godt");
    drafts.set(target("bad"), "Dårligt {x}");
    const notify = vi.fn();
    const client = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useSaveDrafts(drafts, { notify } as never), { wrapper });

    result.current.mutate(drafts.all());

    await waitFor(() => expect(notify).toHaveBeenCalled());
    expect(drafts.has(targetId(target("good")))).toBe(false);
    expect(drafts.get(targetId(target("bad")))).toBe("Dårligt {x}");
    expect(notify.mock.calls[0]?.[2]).toContain("web.bad");
  });
});
