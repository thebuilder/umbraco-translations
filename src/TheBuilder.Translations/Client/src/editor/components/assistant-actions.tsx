import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../api/generated/client.js";
import type { AssistantTask } from "../../api/generated/models.js";
import { Button } from "../../bridge/uui/index.js";
import type { EditTarget } from "../state/target.js";
import { Spark } from "./glyphs.js";
import { Caret, Picker } from "./picker.js";

const REWRITES: readonly { value: AssistantTask; name: string }[] = [
  { value: "Improve", name: "Improve" },
  { value: "Simplify", name: "Simplify" },
  { value: "Shorten", name: "Shorten" },
  { value: "FixSpelling", name: "Fix spelling" },
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
 */
export const RewriteMenu = ({ suggestions, text }: { suggestions: Suggestions; text: string }) => {
  const writing = suggestions.pending !== null && suggestions.pending !== "Translate";
  return (
    <Picker
      className="picker--add assistant-offer"
      label="Rewrite with AI"
      onChange={(task) => suggestions.ask(task as AssistantTask)}
      options={REWRITES.map((rewrite) => ({
        ...rewrite,
        disabled: suggestions.pending !== null || text.trim() === "",
      }))}
      placeholder="Rewrite"
      value=""
    >
      <Spark className="assistant-offer__spark" />
      {writing ? "Rewriting…" : "Rewrite"}
      <Caret />
    </Picker>
  );
};
