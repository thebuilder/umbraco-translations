import { useMutation } from "@tanstack/react-query";
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

/**
 * What the AI assistant can do with the translation that is open: write it from the reference
 * language, or rewrite what is in the field.
 *
 * A suggestion is never saved. It goes into the field as unsaved text, where it can be read, edited,
 * undone or saved like anything typed -- the editor stays the one deciding what the site says. The
 * server has already held it to the same rule a save is, so whatever arrives can be saved.
 */
export const AssistantActions = ({
  target,
  reference,
  text,
  onSuggestion,
}: {
  target: EditTarget;
  /** The language to translate from, when the view is comparing against one. */
  reference?: { locale: string; name: string };
  /** What is in the field now, which a rewrite works on. */
  text: string;
  onSuggestion: (text: string) => void;
}) => {
  const suggest = useMutation({
    mutationFn: (task: AssistantTask) =>
      api.suggest({
        ...target,
        task,
        text: task === "Translate" ? null : text,
        referenceLocale: task === "Translate" ? (reference?.locale ?? null) : null,
      }),
    onSuccess: (suggestion) => onSuggestion(suggestion.value),
  });

  return (
    <div className="assistant">
      <span aria-hidden="true" className="assistant__mark">
        <Spark className="assistant__spark" />
      </span>
      {reference ? (
        <Button
          className="button--soft"
          disabled={suggest.isPending}
          onClick={() => suggest.mutate("Translate")}
        >
          Translate from {reference.name}
        </Button>
      ) : null}
      {/* A menu rather than four buttons: rewriting is the less common job, and four offers in a
          row would outweigh the field they sit under. */}
      <Picker
        className="picker--add"
        label="Rewrite with AI"
        onChange={(task) => suggest.mutate(task as AssistantTask)}
        options={REWRITES.map((rewrite) => ({
          ...rewrite,
          disabled: suggest.isPending || text.trim() === "",
        }))}
        placeholder="Rewrite"
        value=""
      >
        Rewrite
        <Caret />
      </Picker>
      {suggest.isPending ? (
        <span className="assistant__state" role="status">
          Writing…
        </span>
      ) : null}
      {suggest.isError ? (
        <p className="notice notice--error assistant__error" role="alert">
          {suggest.error.message}
        </p>
      ) : null}
    </div>
  );
};
