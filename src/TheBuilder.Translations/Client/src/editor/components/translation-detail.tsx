import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Ref, useEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type {
  LocaleFacet,
  MessageCell,
  MessageDetail,
  MessageFormat,
  MessageKey,
} from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import { queryKeys } from "../api/keys.js";
import type { OpenTranslation } from "../app/use-editor-selection.js";
import { cellOf, textOf } from "../state/cells.js";
import { type DraftStore, useDraft } from "../state/drafts.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeName } from "../state/locales.js";
import { type EditTarget, fullKey, targetId } from "../state/target.js";
import type { FieldHandle } from "../syntax/message-field.js";
import { SyntaxText } from "../syntax/syntax-text.js";
import { describeOverride } from "../validation/override.js";
import { cellStatus } from "./cell-status.js";
import { DefaultValue } from "./default-value.js";
import { EditorFoot } from "./editor-foot.js";
import { shortcutFor } from "./editor-shortcut.js";
import { MessageNotices } from "./message-notices.js";
import { OverrideField } from "./override-field.js";
import { StatusBadge } from "./status-badge.js";

/**
 * The editor for one translation, drawn in place of the row it was opened from.
 *
 * Not a pane beside the list. A pane took half the width from the results it was opened from,
 * which made the list it was meant to keep in view too narrow to read, and the job is one string at
 * a time: find it, change it, move on. Opening in place keeps the rows above and below exactly
 * where they were, and lays the field out under the language it writes.
 *
 * The editor is addressed by identity, not by message id. A language the applications do not ship
 * has no row and therefore no id until something is written to it, and those are the only rows
 * that matter for the job of bringing a language up from nothing.
 *
 * Its three parts are written in the order they are drawn -- the key, the field, the text it is
 * read against -- so a screen reader meets them in the same order as everybody else.
 */
export const TranslationDetail = ({
  open,
  row,
  bridge,
  locales,
  reference,
  mode,
  canEdit,
}: {
  open: OpenTranslation;
  /** The list row this was opened from, which already holds the text of both languages on screen. */
  row: MessageKey;
  bridge: BackofficeBridge;
  locales: readonly LocaleFacet[];
  /** The language being compared against or written from, when one is chosen. */
  reference?: { locale: string; name: string };
  mode: EditingMode;
  /**
   * Whether this user may write translations. The API enforces it either way; without it here the
   * editor offers a field to type in and a Save button that can only ever fail.
   */
  canEdit: boolean;
}) => {
  const { target, next, select, close } = open;
  const queryClient = useQueryClient();
  const cell = cellOf(row, target.locale);
  const id = cell?.id;

  /*
   * The list carries previews, not whole messages: the server truncates them, and editing a value
   * the client only holds the first part of would silently discard the rest. So anything with a row
   * behind it is fetched in full. Anything without one has nothing to fetch -- there is no message
   * yet -- and the key itself supplies the format and placeholders a draft has to satisfy.
   */
  const detail = useQuery({
    queryKey: queryKeys.message(id ?? ""),
    queryFn: ({ signal }) => {
      // `enabled` below keeps this from running without an id. Saying so out loud means a change to
      // one of the two shows up as a thrown error rather than a request for message "undefined".
      if (id === undefined) {
        throw new Error("The message query ran without an id.");
      }
      return api.message(id, signal);
    },
    enabled: id !== undefined,
  });

  const message: MessageDetail | undefined =
    id === undefined ? unwritten(target, row) : detail.data;

  const { draft, setDraft, value, dirty, blanking, problem } = useMessageDraft(
    open.drafts,
    target,
    message
  );
  const field = useRef<FieldHandle>(null);
  const heading = useRef<HTMLButtonElement>(null);
  useOpeningFocus(open, canEdit, message !== undefined, field, heading);

  /**
   * The list and the counts have to be refetched, but the message itself does not: the write
   * returned its own result, so seeding the cache with that shows the saved text immediately.
   * Invalidating instead left the field blank until the refetch landed, which reads as the save
   * having wiped it.
   */
  const settle = (saved?: MessageDetail) => {
    setDraft(undefined);
    if (saved) {
      queryClient.setQueryData(queryKeys.message(saved.id), saved);
    }
    // Not awaited: react-query routes a failed refetch into the query's own error state, which
    // the list already renders. The save this follows has succeeded either way.
    queryClient.invalidateQueries({ queryKey: queryKeys.keys() });
    queryClient.invalidateQueries({ queryKey: queryKeys.facets() });
  };

  const save = useMutation({
    mutationFn: ({ override, then: _then }: { override: string; then: "close" | "next" }) =>
      api.saveOverride({
        ...target,
        value: override,
        expectedVersion: message?.version ?? undefined,
      }),
    // Saving leaves the row, the same as reverting does: the row beside it shows the new text and
    // its status, which is the confirmation. Nothing is announced -- a toast would land on the
    // button just pressed and repeat what the list already says. Failures still notify, because
    // nothing else would say so, and the editor stays open with the text intact to fix.
    onSuccess: (saved, variables) => {
      settle(saved);
      if (variables.then === "next" && next) {
        select(next);
      } else {
        close();
      }
    },
    onError: (error) => bridge.notify("danger", "Translation could not be saved", error.message),
  });

  const revert = useMutation({
    mutationFn: () =>
      api.resetOverride({ ...target, expectedVersion: message?.version ?? undefined }),
    onSuccess: () => {
      settle();
      close();
    },
    onError: (error) => bridge.notify("danger", "Translation could not be reset", error.message),
  });

  const savable = canEdit && dirty && !blanking && !problem && !save.isPending;
  const commit = (then: "close" | "next") => {
    if (savable && draft !== undefined) {
      save.mutate({ override: draft, then });
    }
  };

  useEditorKeys(open, commit);

  const referenceText = reference ? textOf(cellOf(row, reference.locale)) : null;
  // Nothing written here yet, so the text being translated from is the starting point on offer.
  const startsFromReference = referenceText !== null && (mode === "queue" || cell === undefined);

  return (
    <section aria-label="Edit translation" className="editor">
      <EditorMeta bridge={bridge} cell={cell} heading={heading} target={target} />

      <div className="editor__cell editor__field">
        {/* The field's own box, holding what the row already shows, while the whole message is
            fetched. A line of "Loading" in its place was a different height, so the row jumped
            when the field arrived. */}
        {detail.isLoading ? (
          <div aria-busy="true" className="code code--loading">
            <p className="code__text">{textOf(cell)}</p>
          </div>
        ) : null}
        {detail.isError ? <p className="notice notice--error">{detail.error.message}</p> : null}

        {message ? (
          <>
            <MessageNotices message={message} />
            <OverrideField
              canEdit={canEdit}
              field={field}
              language={localeName(locales, target.locale)}
              locale={target.locale}
              message={message}
              problem={problem}
              setDraft={setDraft}
              value={value}
            />
            <DefaultValue
              canEdit={canEdit}
              message={message}
              onRevert={() => revert.mutate()}
              reverting={revert.isPending}
            />
          </>
        ) : null}
      </div>

      {reference ? (
        <div className="editor__cell editor__reference">
          <Reference
            format={row.format}
            name={reference.name}
            // A starting point, not a translation. Most languages are closer to the reference than
            // to an empty box, and retyping a key name or a placeholder by hand is how a save fails
            // validation for a reason nobody meant.
            onCopy={
              canEdit && startsFromReference && referenceText
                ? () => setDraft(referenceText)
                : undefined
            }
            text={referenceText}
          />
        </div>
      ) : null}

      <EditorFoot
        canEdit={canEdit}
        commit={commit}
        dirty={dirty}
        mode={mode}
        open={open}
        savable={savable}
        saving={save.isPending}
        // The row's own preview until the message arrives, so the status does not change under the
        // editor's eyes when it does.
        state={describeDraftState(dirty, message ?? cell)}
      />
    </section>
  );
};

/**
 * What the footer says before anything is pressed. An override the server has never been given is
 * absent rather than empty, and it arrives as either `null` or `undefined` depending on which
 * endpoint answered, so both mean "nothing written here yet".
 */
const describeDraftState = (
  dirty: boolean,
  saved: Pick<MessageCell, "overrideValue" | "defaultValue"> | undefined
): string => {
  if (dirty) {
    return "Unsaved changes";
  }
  if (saved?.overrideValue !== null && saved?.overrideValue !== undefined) {
    return "Your text is saved";
  }
  // The field starts from the default text, so where there is some, that is what it holds.
  return saved?.defaultValue ? "Default text" : "Nothing written here yet";
};

/**
 * The text being typed, measured against what is saved and against the server's rule.
 *
 * Kept in the draft store rather than here, so it survives this editor unmounting, and only while
 * it differs from what is saved: typing back to the saved text forgets it, which is what makes
 * "is there unsaved text" the same question as "is there an entry".
 */
const useMessageDraft = (
  drafts: DraftStore,
  target: EditTarget,
  message: MessageDetail | undefined
) => {
  const id = targetId(target);
  const draft = useDraft(drafts, id);
  /*
   * The field starts from the text the site serves now: the editor's own, or the default where
   * there is none. Correcting a typo is editing the sentence that has it, and an empty box beside
   * it asked for the whole thing to be retyped.
   */
  const committed = message?.overrideValue ?? message?.defaultValue ?? "";
  const value = draft ?? committed;
  const dirty = draft !== undefined && draft !== committed;
  // Emptying the default text is not a translation. Saved, it would blank the string on the site
  // rather than leave it alone, which is never what clearing the field to start again meant.
  const blanking = value === "" && message?.overrideValue === null;

  const setDraft = (text: string | undefined) =>
    drafts.set(id, text === committed ? undefined : text);

  /**
   * The same rule the server applies, checked as the editor types so a mistake is answered beside
   * the field instead of by a failed save. Blank is exempt: an empty draft means "go back to the
   * default text", which is a reset rather than a translation missing its placeholders.
   */
  const problem = message && value !== "" ? describeOverride(value, message) : null;

  return { draft, setDraft, value, dirty, blanking, problem };
};

/**
 * Focus goes to the field being filled in, not the key: the editor exists to be typed into. Only
 * for a translation opened on purpose, though -- see OpenTranslation.claimFocus. Until the message
 * arrives there is no field, so the key holds focus and hands it on when it does, which is why the
 * claim is remembered rather than spent on the first run.
 */
const useOpeningFocus = (
  open: OpenTranslation,
  canEdit: boolean,
  loaded: boolean,
  field: { current: FieldHandle | null },
  heading: { current: HTMLButtonElement | null }
) => {
  const wantsFocus = useRef<boolean | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded is a trigger rather than a read. The message arriving is what puts the field there to be focused; the claim is read once, on the first run.
  useEffect(() => {
    if (wantsFocus.current === null) {
      wantsFocus.current = open.claimFocus(open.target);
    }
    if (!wantsFocus.current) {
      return;
    }
    // The field puts the caret at the end of what is already there rather than selecting it, so a
    // keystroke does not wipe an existing translation.
    const element = canEdit ? (field.current ?? heading.current) : heading.current;
    element?.focus();
    if (!canEdit || field.current) {
      wantsFocus.current = false;
    }
  }, [canEdit, loaded]);
};

/** The editor's keys, listened for on the window so they work from anywhere in the open row. */
const useEditorKeys = (open: OpenTranslation, commit: (then: "close" | "next") => void) => {
  /*
   * Held in a ref because the handler closes over values that change on every keystroke. Without it
   * the effect resubscribes on each render, which is how one Escape ended up asking twice.
   */
  const latest = useRef<(event: KeyboardEvent) => void>(() => {
    /* Replaced on the line below, before any render can subscribe to it. */
  });
  latest.current = (event: KeyboardEvent) => {
    const shortcut = shortcutFor(event);
    if (!shortcut) {
      return;
    }

    // While a discard is being asked about, Escape answers that instead -- dismissing the question,
    // not the editor -- because otherwise the key that got someone into the prompt would also throw
    // their text away. Nothing else is listened for while that question is open: the only two
    // answers to it are its own two buttons.
    if (shortcut.kind === "leave") {
      event.preventDefault();
      return open.pending ? open.keepEditing() : open.close();
    }
    if (open.pending) {
      return;
    }

    if (shortcut.kind === "move") {
      const destination = shortcut.back ? open.previous : open.next;
      // At either end of the result the keystroke is left alone rather than swallowed, so it still
      // does whatever the platform does with it inside the field.
      if (!destination) {
        return;
      }
      event.preventDefault();
      return open.select(destination);
    }

    event.preventDefault();
    commit(shortcut.andThen === "next" && open.next ? "next" : "close");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};

/**
 * The key the open row is about, and what is known about the text written under it.
 *
 * Said plainly rather than folded away behind a disclosure, and taken from the row rather than the
 * fetched message, so it is all there on the first frame: facts that arrived with the message made
 * this column, and with it the open row, grow a moment after opening. The format and the source
 * revision are left out: both are set once on the source, so they say nothing about this key.
 */
const EditorMeta = ({
  target,
  cell,
  heading,
  bridge,
}: {
  target: EditTarget;
  /** The row's own cell for this language, which carries its status and who last edited it. */
  cell: MessageCell | undefined;
  /** Focused instead of the field when there is nothing to type into. */
  heading: Ref<HTMLButtonElement>;
  bridge: BackofficeBridge;
}) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  /**
   * The clipboard is refused outside a secure context and while the document is unfocused, and the
   * backoffice is served over plain HTTP often enough for that to be the normal case rather than
   * the exceptional one. Unanswered, the button looks like it worked and the paste is whatever was
   * copied before it, so a failure still says so. Success is said in place, where the click was.
   */
  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(fullKey(target));
      setCopied(true);
    } catch {
      bridge.notify("danger", "Could not copy the key", "Select the key and copy it manually.");
    }
  };

  return (
    <div className="editor__cell editor__meta">
      {/* The key is the copy button: it is the thing being copied, and a separate button beside it
          sat closer to the language heading than to the key it was for. */}
      <button
        className="editor__key"
        onClick={() => {
          copyKey();
        }}
        ref={heading}
        title="Copy the full key"
        type="button"
      >
        <span className="editor__namespace">{target.namespace}.</span>
        {target.key}
        <span aria-live="polite" className="editor__copied">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <StatusBadge status={cellStatus(cell)} />
      {cell?.updatedAt ? (
        <p className="editor__note">
          Edited {new Date(cell.updatedAt).toLocaleDateString()}
          {cell.updatedBy ? ` by ${cell.updatedBy}` : ""}
        </p>
      ) : null}
    </div>
  );
};

/**
 * The text being compared against or written from, in full rather than as the row's preview, set
 * level with the field and in the same type, so the two read as a pair.
 */
const Reference = ({
  name,
  text,
  format,
  onCopy,
}: {
  name: string;
  text: string | null;
  format: MessageFormat;
  /** Offered while the field is still waiting for its first text. */
  onCopy?: () => void;
}) => (
  <section className="editor__block">
    <h3 className="editor__label editor__label--stacked">{name}</h3>
    <div className="code code--readonly">
      <p className="code__text">
        {text === null ? <em>Not written</em> : <SyntaxText format={format} text={text} />}
      </p>
    </div>
    {onCopy ? (
      <Button className="button--soft editor__copy" onClick={onCopy}>
        Copy {name} in
      </Button>
    ) : null}
  </section>
);

/**
 * A translation that does not exist yet, described the way a saved one would be.
 *
 * The application ships nothing for this language and key, so there is no row, no version and no
 * revision -- but the key still decides the format and the placeholders any text written here has
 * to satisfy, and those come from the row the editor was opened from. Everything else is honestly
 * empty rather than absent, which keeps one shape for the editor to render.
 */
const unwritten = (target: EditTarget, row: MessageKey): MessageDetail => ({
  id: "",
  sourceId: target.sourceId,
  namespace: target.namespace,
  key: target.key,
  locale: target.locale,
  defaultValue: "",
  overrideValue: null,
  format: row.format,
  arguments: row.arguments,
  needsReview: false,
  state: "Absent",
  sourceRevision: "",
  defaultChecksum: "",
  version: null,
  updatedAt: null,
  updatedBy: null,
});
