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
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, localeName } from "../state/locales.js";
import { type EditTarget, fullKey } from "../state/target.js";
import type { FieldHandle } from "../syntax/message-field.js";
import { SyntaxText } from "../syntax/syntax-text.js";
import { describeOverride } from "../validation/override.js";
import { type CellStatus, cellStatus } from "./cell-status.js";
import { DefaultValue } from "./default-value.js";
import { EditorFoot } from "./editor-foot.js";
import { shortcutFor } from "./editor-shortcut.js";
import { textOf } from "./key-columns.js";
import { MessageNotices } from "./message-notices.js";
import { OverrideField } from "./override-field.js";

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
 * The reading order is the order the work happens in, and it is not the same order for both jobs.
 * With text already in the language being edited, the field comes first and everything else is
 * evidence around it. With nothing there yet, the text being translated from comes first, because
 * it is what is being read.
 */
export const TranslationDetail = ({
  target,
  row,
  bridge,
  locales,
  reference,
  mode,
  previous,
  next,
  canEdit,
  pending,
  onKeepEditing,
  onDiscard,
  onDraftChange,
  initialDraft,
  claimFocus = () => true,
  select,
  close,
  columns,
}: {
  target: EditTarget;
  /** The list row this was opened from, which already holds the text of both languages on screen. */
  row: MessageKey;
  bridge: BackofficeBridge;
  locales: readonly LocaleFacet[];
  /** The language being compared against or written from, when one is chosen. */
  reference?: { locale: string; name: string };
  mode: EditingMode;
  previous?: EditTarget;
  /** The row after this one, so a reviewer can work down the list without returning to it. */
  next?: EditTarget;
  /**
   * Whether this user may write translations. The API enforces it either way; without it here the
   * editor offers a field to type in and a Save button that can only ever fail.
   */
  canEdit: boolean;
  /**
   * Set when leaving has been asked for and there is unsaved text in the way: where the editor is
   * trying to go, or "close". The question is answered in the footer rather than by a native
   * dialog -- `confirm` is suppressed in enough contexts that relying on it left the editor with no
   * way out at all.
   */
  pending?: EditTarget | "close";
  onKeepEditing: () => void;
  onDiscard: () => void;
  /**
   * The text typed here and not saved, or undefined once it matches what is. Kept by the parent, so
   * it survives this editor unmounting: scrolled out of a virtualized list, or filtered out of a
   * search.
   */
  onDraftChange: (draft: string | undefined) => void;
  /** Unsaved text left in this translation the last time it was open. */
  initialDraft?: string;
  /**
   * Whether this editor was opened on purpose, and so should take focus. False for one that mounts
   * again because its row came back into view; taking the caret then is stealing it.
   */
  claimFocus?: () => boolean;
  select: (target: EditTarget) => void;
  close: () => void;
  /** The list's column template, so the field sits under its own language. */
  columns?: string;
}) => {
  const queryClient = useQueryClient();
  const cell = localeIn(row.cells, target.locale);
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

  const { draft, setDraft, value, dirty, blanking, problem } = useDraft(
    message,
    onDraftChange,
    initialDraft
  );
  const field = useRef<FieldHandle>(null);
  const heading = useRef<HTMLButtonElement>(null);

  /*
   * Focus goes to the field being filled in, not the key: the editor exists to be typed into. Until
   * the message arrives there is no field, so the key holds focus and hands it on when it does --
   * which is why the claim is remembered rather than spent on the first run.
   */
  const wantsFocus = useRef<boolean | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: message is a trigger rather than a read. It arriving late is what puts the field there to be focused.
  useEffect(() => {
    if (wantsFocus.current === null) {
      wantsFocus.current = claimFocus();
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
  }, [canEdit, claimFocus, message !== undefined]);

  /**
   * The list and the counts have to be refetched, but the message itself does not: the write
   * returned its own result, so seeding the cache with that shows the saved text immediately.
   * Invalidating instead left the field blank until the refetch landed, which reads as the save
   * having wiped it.
   */
  const settle = (saved?: MessageDetail) => {
    setDraft(undefined);
    onDraftChange(undefined);
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

  useEditorKeys({ pending, previous, next, select, close, onKeepEditing, commit });

  const language = localeName(locales, target.locale);
  const status = cellStatus(cell);
  const referenceText = reference ? textOf(localeIn(row.cells, reference.locale)) : null;
  // Nothing written here yet, so the text being translated from is what there is to read, and it
  // leads. With something already written the field is what the editor came for.
  const leadsWithReference = referenceText !== null && (mode === "queue" || cell === undefined);

  /*
   * Which of the list's columns each part sits under: the field under the language being edited,
   * next to the key, and the reference under its own column after it.
   */
  const fieldColumn = 2;
  const context = reference ? (
    <div className="editor__cell" style={{ gridColumn: 5 - fieldColumn }}>
      <Reference
        format={row.format}
        name={reference.name}
        // A starting point, not a translation. Most languages are closer to the reference than to
        // an empty box, and retyping a key name or a placeholder by hand is how a save fails
        // validation for a reason nobody meant.
        onCopy={
          canEdit && leadsWithReference && referenceText ? () => setDraft(referenceText) : undefined
        }
        text={referenceText}
      />
    </div>
  ) : null;
  // Before the field in the document when it is what is being read first, after it otherwise.
  const contextFirst = leadsWithReference ? context : null;
  const contextLast = leadsWithReference ? null : context;

  return (
    <section
      aria-label="Edit translation"
      className="editor"
      style={{ gridTemplateColumns: columns }}
    >
      <EditorMeta bridge={bridge} cell={cell} heading={heading} status={status} target={target} />

      {contextFirst}

      <div className="editor__cell" style={{ gridColumn: fieldColumn }}>
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
              language={language}
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

      {contextLast}

      <EditorFoot
        canEdit={canEdit}
        close={close}
        commit={commit}
        // The row's own preview until the message arrives, so the status does not change under the
        // editor's eyes when it does.
        defaultValue={message?.defaultValue ?? cell?.defaultValue}
        dirty={dirty}
        mode={mode}
        next={next}
        onDiscard={onDiscard}
        onKeepEditing={onKeepEditing}
        overrideValue={message === undefined ? cell?.overrideValue : message.overrideValue}
        pending={pending}
        savable={savable}
        saving={save.isPending}
        select={select}
      />
    </section>
  );
};

/** The text being typed, measured against what is saved and against the server's rule. */
const useDraft = (
  message: MessageDetail | undefined,
  onDraftChange: (draft: string | undefined) => void,
  initialDraft: string | undefined
) => {
  const [draft, setDraft] = useState<string | undefined>(initialDraft);
  /*
   * The field starts from the text the site serves now: the editor's own, or the application's
   * where there is none. Correcting a typo is editing the sentence that has it, and an empty box
   * beside it asked for the whole thing to be retyped.
   */
  const committed = message?.overrideValue ?? message?.defaultValue ?? "";
  const value = draft ?? committed;
  const dirty = draft !== undefined && draft !== committed;
  // Emptying the application's text is not a translation. Saved, it would blank the string on the
  // site rather than leave it alone, which is never what clearing the field to start again meant.
  const blanking = value === "" && message?.overrideValue === null;

  // The parent guards navigation away from unsaved text and keeps it, so it has to know as it
  // changes. Nothing is reported on unmount: the text outliving the editor is the point.
  useEffect(() => onDraftChange(dirty ? draft : undefined), [dirty, draft, onDraftChange]);

  /**
   * The same rule the server applies, checked as the editor types so a mistake is answered beside
   * the field instead of by a failed save. Blank is exempt: an empty draft means "go back to the
   * application text", which is a reset rather than a translation missing its placeholders.
   */
  const problem = message && value !== "" ? describeOverride(value, message) : null;

  return { draft, setDraft, value, dirty, blanking, problem };
};

/**
 * The editor's keys, listened for on the window so they work from anywhere in the open row.
 */
const useEditorKeys = ({
  pending,
  previous,
  next,
  select,
  close,
  onKeepEditing,
  commit,
}: {
  pending?: EditTarget | "close";
  previous?: EditTarget;
  next?: EditTarget;
  select: (target: EditTarget) => void;
  close: () => void;
  onKeepEditing: () => void;
  commit: (then: "close" | "next") => void;
}) => {
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
      return pending ? onKeepEditing() : close();
    }
    if (pending) {
      return;
    }

    if (shortcut.kind === "move") {
      const destination = shortcut.back ? previous : next;
      // At either end of the result the keystroke is left alone rather than swallowed, so it still
      // does whatever the platform does with it inside the field.
      if (!destination) {
        return;
      }
      event.preventDefault();
      return select(destination);
    }

    event.preventDefault();
    commit(shortcut.andThen === "next" && next ? "next" : "close");
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
  status,
  heading,
  bridge,
}: {
  target: EditTarget;
  /** The row's own cell for this language, which carries who last edited it and when. */
  cell: MessageCell | undefined;
  status: CellStatus;
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
      {status.text ? (
        <span
          className={status.state === "Removed" ? "badge badge--danger" : "badge badge--warning"}
        >
          {status.text}
        </span>
      ) : null}
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
 * The text being compared against or written from, in full rather than as the row's preview, and
 * drawn as a field that cannot be typed in: it sits level with the one that can, and reads as the
 * other half of the pair rather than as a caption beside it.
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
