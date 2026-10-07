import { useMutation } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { AssistantTask } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/index.js";
import type { EditTarget } from "../state/target.js";
import { Chevron, Spark } from "./glyphs.js";

/** Each rewrite with what it does, in a line, so choosing one is not a guess. */
const REWRITES: readonly { task: AssistantTask; name: string; hint: string }[] = [
  { task: "Improve", name: "Improve", hint: "Reads more naturally" },
  { task: "Simplify", name: "Simplify", hint: "Plainer words, shorter sentences" },
  { task: "Shorten", name: "Shorten", hint: "Fewer words, same meaning" },
  { task: "FixSpelling", name: "Fix spelling", hint: "Spelling and grammar only" },
];

/** The assistant's state for the open translation, shared by the offers drawn in different places. */
export interface Suggestions {
  ask: (task: AssistantTask) => void;
  error: string | null;
  /** What is being written right now, if anything. */
  pending: AssistantTask | null;
}

/**
 * What the AI assistant can do with the translation that is open: write it from the reference
 * language, or rewrite what is in the field. The offers sit where the job is -- translating beside
 * the text it translates from, rewriting with the other actions -- so the state lives here, once.
 *
 * A suggestion is never saved. It goes into the field as unsaved text, where it can be read, edited,
 * undone or saved like anything typed -- the editor stays the one deciding what the site says. The
 * server has already held it to the same rule a save is, so whatever arrives can be saved.
 *
 * A suggestion only lands on the text it was asked about. One that arrives after the field has
 * changed is dropped rather than typed over the editor's work, and leaving the translation cancels
 * the request, so a reply never turns up as unsaved changes on a row nobody is looking at.
 */
export const useSuggestions = ({
  target,
  reference,
  text,
  onSuggestion,
}: {
  target: EditTarget;
  /** The language to translate from, when the view is comparing against one. */
  reference?: { locale: string };
  /** What is in the field now, which a rewrite works on. */
  text: string;
  onSuggestion: (text: string) => void;
}): Suggestions => {
  const current = useRef(text);
  useEffect(() => {
    current.current = text;
  }, [text]);

  const request = useRef<AbortController>(null);
  useEffect(() => () => request.current?.abort(), []);

  const suggest = useMutation({
    mutationFn: async ({
      task,
      sent,
      signal,
    }: {
      task: AssistantTask;
      sent: string;
      signal: AbortSignal;
    }) => {
      const suggestion = await api.suggest(
        {
          ...target,
          task,
          text: task === "Translate" ? null : sent,
          referenceLocale: task === "Translate" ? (reference?.locale ?? null) : null,
        },
        signal
      );
      if (current.current !== sent) {
        throw new Error(
          "The text changed while the AI was writing, so its suggestion was left out."
        );
      }
      return suggestion.value;
    },
    onSuccess: (value) => onSuggestion(value),
  });

  // The controller is made here rather than in the request, which starts a tick later: closing the
  // translation in that tick would otherwise leave nothing to cancel.
  const ask = (task: AssistantTask) => {
    request.current?.abort();
    request.current = new AbortController();
    suggest.mutate({ task, sent: text, signal: request.current.signal });
  };

  return {
    ask,
    pending: suggest.isPending ? suggest.variables.task : null,
    error: suggest.isError ? suggest.error.message : null,
  };
};

/** Writes the field from the reference language. Drawn under that language's text. */
export const TranslateOffer = ({ suggestions }: { suggestions: Suggestions }) => (
  <Button
    className="button--soft assistant-offer"
    disabled={suggestions.pending !== null}
    label="Translate with AI"
    onClick={() => suggestions.ask("Translate")}
  >
    <Spark className="assistant-offer__spark" />
    {suggestions.pending === "Translate" ? "Translating…" : "Translate"}
  </Button>
);

/**
 * Rewrites what is in the field. A menu rather than four buttons: rewriting is the less common job,
 * and four offers would outweigh the Save they sit beside.
 *
 * Drawn rather than a native select. A select has no way to say what each rewrite does, shows its
 * own name as a ticked first choice, and opens the operating system's menu in the middle of a page
 * that otherwise looks nothing like it.
 *
 * The list is a popover so it sits in the top layer: the open row is one of the list's rows, and
 * anything positioned inside it is clipped by the scrolling list or painted under its neighbours.
 */
export const RewriteMenu = ({ suggestions, text }: { suggestions: Suggestions; text: string }) => {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const writing = suggestions.pending !== null && suggestions.pending !== "Translate";
  const empty = text.trim() === "";

  useLayoutEffect(() => {
    const list = menu.current;
    const button = anchor.current;
    if (!(open && list && button)) {
      return;
    }
    list.showPopover();
    // Above the button, right edges aligned, as the button sits at the foot of the row; below it
    // when there is no room above.
    const place = () => {
      const box = button.getBoundingClientRect();
      const above = box.top - list.offsetHeight - 6;
      list.style.top = `${above < 8 ? box.bottom + 6 : above}px`;
      list.style.left = `${Math.max(8, box.right - list.offsetWidth)}px`;
    };
    place();
    list.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();

    const close = () => setOpen(false);
    // Composed paths, because the editor lives in a shadow root and the event's target is retargeted
    // to its host by the time it reaches the window.
    const outside = (event: Event) => {
      const path = event.composedPath();
      if (!(path.includes(list) || path.includes(button))) {
        close();
      }
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      list.hidePopover();
    };
  }, [open]);

  const choose = (task: AssistantTask) => {
    setOpen(false);
    anchor.current?.focus();
    suggestions.ask(task);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const at = items.findIndex((item) => item.matches(":focus"));
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      // From nothing focused, down is the first and up the last; otherwise round the ends.
      items.at(at === -1 && step < 0 ? -1 : (at + step) % items.length)?.focus();
    } else if (event.key === "Escape") {
      // The menu's Escape, not the editor's: without this the same key would also close the row.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      anchor.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Rewrite with AI"
        className="button button--quiet assistant-offer"
        disabled={suggestions.pending !== null || empty}
        onClick={() => setOpen((was) => !was)}
        ref={anchor}
        title={empty ? "Write something to rewrite first" : undefined}
        type="button"
      >
        <Spark className="assistant-offer__spark" />
        {writing ? "Rewriting…" : "Rewrite"}
        <Chevron className="assistant-offer__caret" direction={open ? "up" : "down"} />
      </button>
      <div
        aria-label="Rewrite with AI"
        className="rewrite-menu"
        onKeyDown={onKeyDown}
        popover="manual"
        ref={menu}
        role="menu"
      >
        {REWRITES.map((rewrite) => (
          <button
            className="rewrite-menu__item"
            key={rewrite.task}
            onClick={() => choose(rewrite.task)}
            role="menuitem"
            tabIndex={-1}
            type="button"
          >
            <span className="rewrite-menu__name">{rewrite.name}</span>
            <span className="rewrite-menu__hint">{rewrite.hint}</span>
          </button>
        ))}
      </div>
    </>
  );
};
