import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { LocaleFacet, MessageDetail, MessageKey } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import { queryKeys } from "../api/keys.js";
import { useKeyLocales } from "../api/queries.js";
import type { EditingMode } from "../state/editing-mode.js";
import { localeIn, localeName } from "../state/locales.js";
import { fullKey, type EditTarget } from "../state/target.js";
import { describeOverride } from "../validation/override.js";
import { cellStatus } from "./cell-status.js";
import { Chevron, Cross } from "./Glyphs.js";
import { KeyLocales } from "./KeyLocales.js";
import { MODIFIER } from "./Shortcuts.js";
import { valueOf } from "./key-columns.js";

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
  target, row, bridge, locales, reference, mode, term, position, previous, next,
  canEdit, pending, onKeepEditing, onDiscard, onDirtyChange, select, switchLocale, close,
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
    queryFn: ({ signal }) => api.message(id!, signal),
    enabled: id !== undefined,
  });

  const message: MessageDetail | undefined = id === undefined ? unwritten(target, row) : detail.data;

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
  useEffect(() => {
    const element = canEdit ? field.current ?? heading.current : heading.current;
    element?.focus();
    // At the end of what is already there, rather than selecting it, so a keystroke does not wipe
    // an existing translation.
    if (element instanceof HTMLTextAreaElement)
      element.setSelectionRange(element.value.length, element.value.length);
  }, [target.locale, target.key, canEdit, message !== undefined]);

  // Grows with what is typed instead of scrolling inside a fixed box, up to a share of the pane.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
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
    if (saved) queryClient.setQueryData(queryKeys.message(saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: queryKeys.keys() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.facets() });
  };

  const save = useMutation({
    mutationFn: ({ value }: { value: string; then: "close" | "next" }) =>
      api.saveOverride({ ...target, value, expectedVersion: message?.version ?? undefined }),
    // Saving leaves the row, the same as reverting does: the row beside it shows the new text and
    // its status, which is the confirmation. Nothing is announced -- a toast would land on the
    // button just pressed and repeat what the list already says. Failures still notify, because
    // nothing else would say so, and the pane stays open with the text intact to fix.
    onSuccess: (saved, variables) => {
      settle(saved);
      if (variables.then === "next" && next) select(next);
      else close();
    },
    onError: (error) => bridge.notify("danger", "Translation could not be saved", error.message),
  });

  const revert = useMutation({
    mutationFn: () => api.resetOverride({ ...target, expectedVersion: message?.version ?? undefined }),
    onSuccess: () => { settle(); close(); },
    onError: (error) => bridge.notify("danger", "Translation could not be reset", error.message),
  });

  const savable = canEdit && dirty && !problem && !save.isPending;
  const commit = (then: "close" | "next") => {
    if (savable && draft !== undefined) save.mutate({ value: draft, then });
  };

  /*
   * Escape leaves. While a discard is being asked about, Escape answers that instead -- dismissing
   * the question, not the pane -- because otherwise the key that got someone into the prompt would
   * also throw their text away. Nothing else is listened for while that question is open: the only
   * two answers to it are its own two buttons.
   *
   * Ctrl/Cmd+S and Ctrl/Cmd+Enter both save. Enter alone cannot: the field holds real newlines, and
   * messages legitimately contain them. Both have to be caught here, or the browser offers to save
   * the page and the Enter goes into the text instead.
   *
   * Ctrl/Cmd and an arrow moves to the translation above or below, which is the same thing the
   * arrows do in the list. The modifier is what makes it possible at all: the caret is in a text
   * field, so a bare arrow belongs to the text, and without a way past that the pane is a dead end
   * for anyone not reaching for the mouse. Saving already had a way onward -- Shift+Ctrl/Cmd+Enter
   * -- but only forwards and only by saving, which is no use for reading down a list of results.
   *
   * Held in a ref because the handler closes over values that change on every keystroke. Without it
   * the effect resubscribes on each render, which is how one Escape ended up asking twice.
   */
  const latest = useRef<(event: KeyboardEvent) => void>(() => {});
  latest.current = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return pending ? onKeepEditing() : close();
    }
    if (pending) return;
    if (!(event.metaKey || event.ctrlKey)) return;

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const destination = event.key === "ArrowUp" ? previous : next;
      // At either end of the result the keystroke is left alone rather than swallowed, so it still
      // does whatever the platform does with it inside the field.
      if (!destination) return;
      event.preventDefault();
      return select(destination);
    }

    if (event.key.toLowerCase() !== "s" && event.key !== "Enter") return;
    event.preventDefault();
    commit(event.shiftKey && next ? "next" : "close");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => latest.current(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const language = localeName(locales, target.locale);
  const status = cellStatus(cell);
  const referenceText = reference ? valueOf(localeIn(row.cells, reference.locale)) : null;
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
    pending === undefined && locales.length > 1,
  );

  return (
    <aside className="pane" role="complementary" aria-label="Edit translation">
      <div className="pane__head">
        <div className="pane__identity">
          <p className="pane__key" ref={heading} tabIndex={-1}>
            <span className="pane__namespace">{target.namespace}.</span>{target.key}
          </p>
          {status.text && (
            <span className={status.state === "Removed" ? "badge badge--danger" : "badge badge--warning"}>
              {status.text}
            </span>
          )}
        </div>

        <div className="pane__controls">
          {position && (
            <span className="pane__position">
              {position.index.toLocaleString()} of {position.total.toLocaleString()}
              {/* The queue is worked an item at a time, and the keystroke that does it is the
                  difference between typing and reaching for the mouse a thousand times. Said beside
                  how much is left, because that is where somebody looks to ask how long this takes. */}
              {mode === "queue" && next && (
                <span className="pane__shortcut"> · ⇧{MODIFIER}↵ next</span>
              )}
            </span>
          )}
          {/* The pair is one control with two directions, so it is spaced as one and the close
              button keeps the gap that says it does something else entirely. */}
          <span className="pane__step">
            <Button
              icon
              label="Previous translation"
              title={`Previous translation (${MODIFIER}↑)`}
              keyShortcuts="Meta+ArrowUp Control+ArrowUp"
              disabled={!previous}
              onClick={() => previous && select(previous)}
            >
              <Chevron direction="up" className="pane__chevron" />
            </Button>
            <Button
              icon
              label="Next translation"
              title={`Next translation (${MODIFIER}↓)`}
              keyShortcuts="Meta+ArrowDown Control+ArrowDown"
              disabled={!next}
              onClick={() => next && select(next)}
            >
              <Chevron direction="down" className="pane__chevron" />
            </Button>
          </span>
          <Button icon label="Close editor" onClick={close}>
            <Cross className="pane__cross" />
          </Button>
        </div>
      </div>

      <div className="pane__body">
        {detail.isLoading && <p className="pane__note">Loading translation…</p>}
        {detail.isError && <p className="notice notice--error">{detail.error.message}</p>}

        {message && (
          <>
            {/* Said in full, once, where the decision is made. The badge in the header is the same
                fact in one word; this is the sentence that explains what to do about it. */}
            {message.state === "Removed" && (
              <p className="callout callout--danger">
                <span aria-hidden="true" className="callout__mark">⚠</span>
                The application no longer ships this key. Your text is kept and still served, but
                nothing in the application asks for it any more.
              </p>
            )}
            {message.needsReview && message.state !== "Removed" && (
              <p className="callout callout--warning">
                <span aria-hidden="true" className="callout__mark">⚠</span>
                The application text changed after this was written. Check it still reads correctly;
                saving clears the warning.
              </p>
            )}

            {leadsWithReference && reference && (
              <section className="pane__block">
                <h3>{reference.name}</h3>
                <p className="pane__reading pane__reading--lead">{referenceText}</p>
              </section>
            )}

            <section className="pane__block">
              <div className="pane__blockhead">
                <h3>
                  {canEdit
                    ? <label htmlFor="override">{language} · your text</label>
                    : `${language} · your text`}
                </h3>
                {canEdit && leadsWithReference && reference && referenceText && (
                  // A starting point, not a translation. Most languages are closer to the reference
                  // than to an empty box, and retyping a key name or a placeholder by hand is how
                  // a save fails validation for a reason nobody meant.
                  <Button className="button--soft" onClick={() => setDraft(referenceText)}>
                    Copy {reference.name} in
                  </Button>
                )}
                {!leadsWithReference && message.updatedAt && (
                  <span className="pane__aside">
                    edited {new Date(message.updatedAt).toLocaleDateString()}
                    {message.updatedBy ? ` by ${message.updatedBy}` : ""}
                  </span>
                )}
              </div>

              {/* Without permission this is something to read, presented as a reading. A field that
                  cannot be saved is an invitation to waste an hour. */}
              {canEdit ? (
                <textarea
                  id="override"
                  ref={field}
                  className="pane__field"
                  rows={3}
                  aria-label={`Your text in ${language}`}
                  aria-invalid={problem !== null}
                  aria-describedby={problem ? "override-problem" : "override-state"}
                  placeholder={leadsWithReference
                    ? `Write the ${language} text`
                    : "Leave blank to use the application text"}
                  value={value}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <p className="pane__reading">{message.overrideValue || <em>Nothing written here</em>}</p>
              )}

              {/* What the application will substitute, beside the text that has to contain them.
                  Shown whether or not the draft is currently valid, because the one thing an
                  editor needs when it is not is the list of what was supposed to be in it, with
                  the missing ones picked out. */}
              {Object.keys(message.arguments).length > 0 && (
                <p className="placeholders">
                  <span className="placeholders__lead">Placeholders</span>
                  {Object.entries(message.arguments).map(([name, kind]) => (
                    <span
                      key={name}
                      className={problem?.missing.includes(name) ? "token token--missing" : "token"}
                    >
                      {`{${name}}`}
                      <span className="token__kind">{kind}</span>
                    </span>
                  ))}
                </p>
              )}

              {problem ? (
                <p id="override-problem" className="notice notice--error" role="alert">{problem.message}</p>
              ) : (
                <p id="override-state" className="visually-hidden">
                  {message.overrideValue === null ? "Using the application text" : "Your own text"}
                </p>
              )}
            </section>

            {/* What the application ships, and the way back to it. Reverting is here rather than in
                the footer because it is a fact about this text, not one of the two things somebody
                came to the pane to press. */}
            {message.defaultValue !== "" && (
              <section className="pane__block">
                <h3>{language} · from the application</h3>
                <div className="pane__default">
                  <span className="pane__reading">{message.defaultValue}</span>
                  {canEdit && message.overrideValue !== null && (
                    <Button label="Revert to the application text" disabled={revert.isPending} onClick={() => revert.mutate()}>
                      Revert to this
                    </Button>
                  )}
                </div>
              </section>
            )}

            {locales.length > 1 && (
              <KeyLocales
                row={others.data}
                locales={locales}
                editing={target.locale}
                reference={reference?.locale}
                mode={mode}
                term={term}
                loading={others.isLoading}
                onEdit={switchLocale}
              />
            )}

            {/* Everything a developer might need and an editor never does. */}
            <details className="technical">
              <summary>Technical details</summary>
              <dl>
                <dt>Full key</dt>
                <dd>
                  <code>{fullKey(target)}</code>
                  <Button
                    label="Copy full key"
                    className="button--small"
                    onClick={() => void navigator.clipboard?.writeText(fullKey(target))}
                  >
                    Copy
                  </Button>
                </dd>
                <dt>Language</dt>
                <dd>{target.locale}</dd>
                <dt>Format</dt>
                <dd>{message.format}</dd>
                {message.sourceRevision && (
                  <>
                    <dt>Source revision</dt>
                    <dd><code>{message.sourceRevision}</code></dd>
                  </>
                )}
                {message.updatedAt && (
                  <>
                    <dt>Last changed</dt>
                    <dd>
                      {new Date(message.updatedAt).toLocaleString()}
                      {message.updatedBy ? ` by ${message.updatedBy}` : ""}
                    </dd>
                  </>
                )}
              </dl>
            </details>
          </>
        )}
      </div>

      {/*
        No Cancel button. Leaving without saving is the close control in the header and Escape, both
        of which already ask about unsaved text, and a third way to do it was crowding the one action
        anybody came here to press.

        Which action is the obvious one depends on the job. Correcting a reported string ends with
        Save; working down a queue ends with the next item, so there Save & next is the primary and
        Skip is the way past a row that needs somebody else.
      */}
      <div className="pane__foot">
        {pending ? (
          <>
            <p className="pane__state">
              {pending === "close" ? "Close without saving your changes?" : "Open another translation without saving?"}
            </p>
            <span className="pane__actions">
              <Button look="primary" onClick={onKeepEditing}>Keep editing</Button>
              <Button look="danger" onClick={onDiscard}>Discard</Button>
            </span>
          </>
        ) : canEdit ? (
          <>
            <p className="pane__state">
              {dirty ? "Unsaved changes"
                : message?.overrideValue != null ? "Your text is saved"
                : "Nothing written here yet"}
            </p>
            <span className="pane__actions">
              {mode === "queue" && next ? (
                <>
                  <Button onClick={() => select(next)}>Skip</Button>
                  <Button look="primary" disabled={!savable} onClick={() => commit("next")}>
                    {save.isPending ? "Saving…" : "Save & next"}
                  </Button>
                </>
              ) : (
                <>
                  {/* Not a second primary: two of them side by side leave neither reading as the
                      obvious one, and this is the shortcut for a long review rather than the usual exit. */}
                  {next && (
                    <Button disabled={!savable} onClick={() => commit("next")}>
                      Save &amp; next
                    </Button>
                  )}
                  <Button look="primary" disabled={!savable} onClick={() => commit("close")}>
                    {save.isPending ? "Saving…" : "Save"}
                  </Button>
                </>
              )}
            </span>
          </>
        ) : (
          <p className="pane__state">You have view-only access to translations.</p>
        )}
      </div>
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
