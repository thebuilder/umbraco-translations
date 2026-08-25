import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { LocaleFacet, MessageDetail, MessageKey } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { queryKeys } from "../api/keys.js";
import { useKeyLocales } from "../api/queries.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, localeName } from "../state/locales.js";
import type { EditTarget } from "../state/target.js";
import { describeOverride } from "../validation/override.js";
import { cellStatus } from "./cell-status.js";
import { DefaultValue } from "./default-value.js";
import { textOf } from "./key-columns.js";
import { KeyLocales } from "./key-locales.js";
import { MessageNotices } from "./message-notices.js";
import { OverrideField } from "./override-field.js";
import { PaneFoot } from "./pane-foot.js";
import { PaneHead } from "./pane-head.js";
import { shortcutFor } from "./pane-shortcut.js";
import { TechnicalDetails } from "./technical-details.js";

/**
 * Editing pane for one translation.
 *
 * Beside the list rather than over it. A drawer was a reasonable answer to a real constraint, but
 * it covered the search results it was opened from, which is exactly the material a reviewer is
 * working against: find the reported sentence, then read the field while the hits stay on screen.
 * Below the width where two panes can both hold a sentence it becomes the drawer it used to be,
 * which is a stylesheet decision rather than a second component.
 *
 * The pane is addressed by identity, not by message id. A language the applications do not ship
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
  term,
  position,
  previous,
  next,
  canEdit,
  pending,
  onKeepEditing,
  onDiscard,
  onDirtyChange,
  select,
  switchLocale,
  close,
}: {
  target: EditTarget;
  /** The list row this was opened from, which already holds the text of both languages on screen. */
  row: MessageKey;
  bridge: BackofficeBridge;
  locales: readonly LocaleFacet[];
  /** The language being compared against or written from, when one is chosen. */
  reference?: { locale: string; name: string };
  mode: EditingMode;
  /** The active search, so the other languages can show where the reported sentence actually is. */
  term: string;
  /** Where this row sits in the result, so a long queue says how much of it is left. */
  position?: { index: number; total: number };
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
  onDirtyChange: (dirty: boolean) => void;
  select: (target: EditTarget) => void;
  /** Fixing the reference language means editing it, which is a change of view rather than a second field. */
  switchLocale: (locale: string) => void;
  close: () => void;
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

  const [draft, setDraft] = useState<string>();
  const field = useRef<HTMLTextAreaElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);

  const committed = message?.overrideValue ?? "";
  const value = draft ?? committed;
  const dirty = draft !== undefined && draft !== committed;

  // The parent guards navigation away from unsaved text, so it has to know as it changes.
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  /**
   * The same rule the server applies, checked as the editor types so a mistake is answered beside
   * the field instead of by a failed save. Blank is exempt: an empty draft means "go back to the
   * application text", which is a reset rather than a translation missing its placeholders.
   */
  const problem = message && value !== "" ? describeOverride(value, message) : null;

  // Focus goes to the field being filled in, not the heading: the pane exists to be typed into.
  // biome-ignore lint/correctness/useExhaustiveDependencies: target and message are triggers rather than reads. Focus belongs to whichever translation the pane is showing, so switching key or language has to move it, and a message arriving late replaces the element that was focused.
  useEffect(() => {
    const element = canEdit ? (field.current ?? heading.current) : heading.current;
    element?.focus();
    // At the end of what is already there, rather than selecting it, so a keystroke does not wipe
    // an existing translation.
    if (element instanceof HTMLTextAreaElement) {
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }, [target.locale, target.key, canEdit, message !== undefined]);

  // Grows with what is typed instead of scrolling inside a fixed box, up to a share of the pane.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the trigger. The height is measured off the DOM, so the text has to have been rendered before this can read it.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [value, target.key]);

  /**
   * The list and the counts have to be refetched, but the message itself does not: the write
   * returned its own result, so seeding the cache with that shows the saved text immediately.
   * Invalidating instead left the field blank until the refetch landed, which reads as the save
   * having wiped it.
   */
  const settle = (saved?: MessageDetail) => {
    setDraft(undefined);
    onDirtyChange(false);
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
    // nothing else would say so, and the pane stays open with the text intact to fix.
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

  const savable = canEdit && dirty && !problem && !save.isPending;
  const commit = (then: "close" | "next") => {
    if (savable && draft !== undefined) {
      save.mutate({ override: draft, then });
    }
  };

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
    // not the pane -- because otherwise the key that got someone into the prompt would also throw
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

  const language = localeName(locales, target.locale);
  const status = cellStatus(cell);
  const referenceText = reference ? textOf(localeIn(row.cells, reference.locale)) : null;
  // Nothing written here yet, so the text being translated from is what there is to read, and it
  // leads. With something already written the field is what the editor came for.
  const leadsWithReference = referenceText !== null && (mode === "queue" || cell === undefined);

  /*
   * The pair is the same one the list used, deliberately: the server builds the key set from those
   * two alone, so any other pair could exclude the very key being asked about. With no comparison
   * chosen the list ran on the target alone and the row came back, so the target alone is what
   * finds it again -- passing nothing here disabled the query outright and took the whole section
   * off the screen for anyone not comparing against a second language.
   */
  const others = useKeyLocales(
    target,
    { locale: target.locale, referenceLocale: reference?.locale ?? target.locale },
    locales.map((locale) => locale.code),
    // Nothing to show while the pane is asking about leaving, and nothing to show for a site with
    // one language, where "every language" is the one already in the field.
    pending === undefined && locales.length > 1
  );

  return (
    <aside aria-label="Edit translation" className="pane">
      <PaneHead
        close={close}
        heading={heading}
        mode={mode}
        next={next}
        position={position}
        previous={previous}
        select={select}
        status={status}
        target={target}
      />

      <div className="pane__body">
        {detail.isLoading ? <p className="pane__note">Loading translation…</p> : null}
        {detail.isError ? <p className="notice notice--error">{detail.error.message}</p> : null}

        {message ? (
          <>
            <MessageNotices message={message} />

            {leadsWithReference && reference ? (
              <section className="pane__block">
                <h3>{reference.name}</h3>
                <p className="pane__reading pane__reading--lead">{referenceText}</p>
              </section>
            ) : null}

            <OverrideField
              canEdit={canEdit}
              field={field}
              language={language}
              leadsWithReference={leadsWithReference}
              message={message}
              problem={problem}
              reference={reference}
              referenceText={referenceText}
              setDraft={setDraft}
              value={value}
            />

            <DefaultValue
              canEdit={canEdit}
              language={language}
              message={message}
              onRevert={() => revert.mutate()}
              reverting={revert.isPending}
            />

            {locales.length > 1 && (
              <KeyLocales
                editing={target.locale}
                loading={others.isLoading}
                locales={locales}
                mode={mode}
                onEdit={switchLocale}
                reference={reference?.locale}
                row={others.data}
                term={term}
              />
            )}

            <TechnicalDetails bridge={bridge} message={message} target={target} />
          </>
        ) : null}
      </div>

      <PaneFoot
        canEdit={canEdit}
        commit={commit}
        dirty={dirty}
        mode={mode}
        next={next}
        onDiscard={onDiscard}
        onKeepEditing={onKeepEditing}
        overrideValue={message?.overrideValue}
        pending={pending}
        savable={savable}
        saving={save.isPending}
        select={select}
      />
    </aside>
  );
};

/**
 * A translation that does not exist yet, described the way a saved one would be.
 *
 * The application ships nothing for this language and key, so there is no row, no version and no
 * revision -- but the key still decides the format and the placeholders any text written here has
 * to satisfy, and those come from the row the pane was opened from. Everything else is honestly
 * empty rather than absent, which keeps one shape for the pane to render.
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
