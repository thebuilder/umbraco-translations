import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../api/errors.js";
import { api } from "../../api/generated/client.js";
import type { EditTarget } from "../state/target.js";
import { RewriteMenu, TranslateOffer, useSuggestions } from "./assistant-actions.js";

vi.mock("../../api/generated/client.js", () => ({
  api: { suggest: vi.fn() },
}));

const TRANSLATE = /^Translate/;
const CHANGED = /^The text changed/;

const target: EditTarget = { sourceId: "s1", namespace: "checkout", key: "pay", locale: "da-DK" };

afterEach(() => {
  cleanup();
  vi.mocked(api.suggest).mockReset();
});

/** Both offers over one shared state, with its error where the detail draws it. */
const Offers = ({
  text,
  onSuggestion,
  reference,
}: {
  text: string;
  onSuggestion: (text: string) => void;
  reference?: { locale: string };
}) => {
  const suggestions = useSuggestions({ target, reference, text, onSuggestion });
  return (
    <>
      {reference ? <TranslateOffer suggestions={suggestions} /> : null}
      <RewriteMenu suggestions={suggestions} text={text} />
      {suggestions.error ? <p role="alert">{suggestions.error}</p> : null}
    </>
  );
};

const show = (props: { text?: string; reference?: { locale: string } | null } = {}) => {
  const onSuggestion = vi.fn();
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const offers = (text: string) => (
    <QueryClientProvider client={client}>
      <Offers
        onSuggestion={onSuggestion}
        reference={props.reference === null ? undefined : (props.reference ?? { locale: "en-US" })}
        text={text}
      />
    </QueryClientProvider>
  );
  const view = render(offers(props.text ?? "Betal {amount}"));
  return { onSuggestion, view, rerender: (text: string) => view.rerender(offers(text)) };
};

describe("the AI assistant's actions", () => {
  it("translates from the reference language and puts the result in the field", async () => {
    vi.mocked(api.suggest).mockResolvedValue({ value: "Betal {amount}" });
    const { onSuggestion } = show();

    screen.getByRole("button", { name: "Translate with AI" }).click();

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
    show({ reference: null });

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
    const { onSuggestion, rerender } = show({ text: "Betal venligst nu" });

    fireEvent.change(screen.getByRole("combobox", { name: "Rewrite with AI" }), {
      target: { value: "Shorten" },
    });
    rerender("Betal venligst nu, tak");
    reply({ value: "Betal" });

    expect((await screen.findByRole("alert")).textContent).toMatch(CHANGED);
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("cancels the request when the translation is closed", async () => {
    vi.mocked(api.suggest).mockReturnValue(new Promise(() => undefined));
    const { view } = show({ text: "Betal" });

    fireEvent.change(screen.getByRole("combobox", { name: "Rewrite with AI" }), {
      target: { value: "Shorten" },
    });
    view.unmount();

    await waitFor(() => expect(api.suggest).toHaveBeenCalled());
    expect(vi.mocked(api.suggest).mock.calls[0]?.[1]?.aborted).toBe(true);
  });

  it("says what went wrong, beside the actions, and leaves the field alone", async () => {
    vi.mocked(api.suggest).mockRejectedValue(
      new ApiError(409, "Umbraco.AI is not installed on this site.")
    );
    const { onSuggestion } = show();

    screen.getByRole("button", { name: "Translate with AI" }).click();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Umbraco.AI is not installed on this site."
    );
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
