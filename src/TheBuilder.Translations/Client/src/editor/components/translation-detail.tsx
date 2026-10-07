import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type {
  LocaleFacet,
  MessageDetail,
  MessageFormat,
  MessageKey,
} from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import { queryKeys } from "../api/keys.js";
import type { OpenTranslation } from "../app/use-editor-selection.js";
import { cellOf, textOf } from "../state/cells.js";
import { localeName } from "../state/locales.js";
import type { EditTarget } from "../state/target.js";
import { SyntaxText } from "../syntax/syntax-text.js";
import { DefaultValue } from "./default-value.js";
import { EditorFoot } from "./editor-foot.js";
import { EditorMeta } from "./editor-meta.js";
import { shortcutFor } from "./editor-shortcut.js";
import { describeDraftState, useMessageDraft } from "./message-draft.js";
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
 * Its three parts are written in the order they are drawn -- the key, the field, the text it is
 * read against -- so a screen reader meets them in the same order as everybody else.
 */
export const TranslationDetail = ({
  open,
  row,
  bridge,
  locales,
  reference,
  canEdit,
}: {
  open: OpenTranslation;
  /** The list row this was opened from, which already holds the text of both languages on screen. */
  row: MessageKey;
  bridge: BackofficeBridge;
  locales: readonly LocaleFacet[];
  /** The language being compared against or written from, when one is chosen. */
  reference?: { locale: string; name: string };
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
    id === undefined ? unwrittenMessage(target, row) : detail.data;

  const { draft, setDraft, value, dirty, blanking, problem } = useMessageDraft(
    open.drafts,
    target,
    message
  );
  /*
   * Whether this editor takes focus, decided once as it opens: only for a translation opened on
   * purpose (see OpenTranslation.claimFocus). The field takes it when it mounts, which is when the
   * message arrives; until then, or without permission to edit, the key holds it.
   */
  const [takesFocus] = useState(() => open.claimFocus());

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
  // Nothing written in this language yet: the reference is the starting point on offer, and the
  // natural way out is on to the next row rather than back to the list.
  const unwritten = cell === undefined;

  return (
    <section aria-label="Edit translation" className="editor">
      <EditorMeta
        bridge={bridge}
        cell={cell}
        focusOnMount={takesFocus && (!canEdit || message === undefined)}
        target={target}
      />

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
              focusOnMount={takesFocus}
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
              canEdit && unwritten && referenceText ? () => setDraft(referenceText) : undefined
            }
            text={referenceText}
          />
        </div>
      ) : null}

      <EditorFoot
        canEdit={canEdit}
        commit={commit}
        dirty={dirty}
        open={open}
        savable={savable}
        saving={save.isPending}
        // The row's own preview until the message arrives, so the status does not change under the
        // editor's eyes when it does.
        state={describeDraftState(dirty, message ?? cell)}
        unwritten={unwritten}
      />
    </section>
  );
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
const unwrittenMessage = (target: EditTarget, row: MessageKey): MessageDetail => ({
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
