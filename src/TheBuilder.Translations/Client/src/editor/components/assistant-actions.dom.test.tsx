import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors.js";
import { api } from "../../api/generated/client.js";
import type { EditTarget } from "../state/target.js";
import { AssistantActions } from "./assistant-actions.js";

vi.mock("../../api/generated/client.js", () => ({
  api: { suggest: vi.fn() },
}));

const TRANSLATE = /^Translate from/;
const CHANGED = /^The text changed/;

const target: EditTarget = { sourceId: "s1", namespace: "checkout", key: "pay", locale: "da-DK" };

afterEach(() => {
  cleanup();
  vi.mocked(api.suggest).mockReset();
});

const show = (props: Partial<Parameters<typeof AssistantActions>[0]> = {}) => {
  const onSuggestion = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AssistantActions
        onSuggestion={onSuggestion}
        reference={{ locale: "en-US", name: "English" }}
        target={target}
        text="Betal {amount}"
        {...props}
      />
    </QueryClientProvider>
  );
  return { onSuggestion };
};

describe("the AI assistant's actions", () => {
  it("translates from the reference language and puts the result in the field", async () => {
    vi.mocked(api.suggest).mockResolvedValue({ value: "Betal {amount}" });
    const { onSuggestion } = show();

    screen.getByRole("button", { name: "Translate from English" }).click();

    await waitFor(() => expect(onSuggestion).toHaveBeenCalledWith("Betal {amount}"));
    expect(api.suggest).toHaveBeenCalledWith(
      {
        ...target,
        task: "Translate",
        text: null,
        referenceLocale: "en-US",
      },
      expect.any(AbortSignal)
    );
  });

  it("rewrites the text that is in the field", async () => {
    vi.mocked(api.suggest).mockResolvedValue({ value: "Betal" });
    const { onSuggestion } = show({ text: "Betal venligst nu" });

    fireEvent.change(screen.getByRole("combobox", { name: "Rewrite with AI" }), {
      target: { value: "Shorten" },
    });

    await waitFor(() => expect(onSuggestion).toHaveBeenCalledWith("Betal"));
    expect(api.suggest).toHaveBeenCalledWith(
      {
        ...target,
        task: "Shorten",
        text: "Betal venligst nu",
        referenceLocale: null,
      },
      expect.any(AbortSignal)
    );
  });

  it("offers no translation without a language to translate from", () => {
    show({ reference: undefined });

    expect(screen.queryByRole("button", { name: TRANSLATE })).toBeNull();
  });

  it("has nothing to rewrite in an empty field", () => {
    show({ text: "  " });

    const menu = screen.getByRole("combobox", { name: "Rewrite with AI" }) as HTMLSelectElement;
    const offered = [...menu.options].filter((option) => option.value !== "");
    expect(offered.every((option) => option.disabled)).toBe(true);
  });

  it("drops a suggestion for text that changed while it was being written", async () => {
    let reply: (value: { value: string }) => void = () => undefined;
    vi.mocked(api.suggest).mockReturnValue(
      new Promise((resolve) => {
        reply = resolve;
      })
    );
    const onSuggestion = vi.fn();
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const actions = (text: string) => (
      <QueryClientProvider client={client}>
        <AssistantActions onSuggestion={onSuggestion} target={target} text={text} />
      </QueryClientProvider>
    );
    const { rerender } = render(actions("Betal venligst nu"));

    fireEvent.change(screen.getByRole("combobox", { name: "Rewrite with AI" }), {
      target: { value: "Shorten" },
    });
    rerender(actions("Betal venligst nu, tak"));
    reply({ value: "Betal" });

    expect((await screen.findByRole("alert")).textContent).toMatch(CHANGED);
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("cancels the request when the translation is closed", async () => {
    vi.mocked(api.suggest).mockReturnValue(new Promise(() => undefined));
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistantActions onSuggestion={vi.fn()} target={target} text="Betal" />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Rewrite with AI" }), {
      target: { value: "Shorten" },
    });
    unmount();

    await waitFor(() => expect(api.suggest).toHaveBeenCalled());
    expect(vi.mocked(api.suggest).mock.calls[0]?.[1]?.aborted).toBe(true);
  });

  it("says what went wrong, beside the actions, and leaves the field alone", async () => {
    vi.mocked(api.suggest).mockRejectedValue(
      new ApiError(409, "Umbraco.AI is not installed on this site.")
    );
    const { onSuggestion } = show();

    screen.getByRole("button", { name: "Translate from English" }).click();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Umbraco.AI is not installed on this site."
    );
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
