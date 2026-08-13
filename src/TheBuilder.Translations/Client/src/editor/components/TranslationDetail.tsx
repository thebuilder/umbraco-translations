import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { MessageDetail } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import { queryKeys } from "../api/keys.js";
import { describeOverride } from "../validation/override.js";

/**
 * Editing panel for one translation.
 *
 * A drawer over the list rather than a third column: at this width a column would squeeze the text
 * being compared, and opening one would resize the table out from under the row just clicked.
 *
 * The reading order is the order the work happens in. What the message says in a language the
 * editor knows, then what the application ships in the language being edited, then the field where
 * they replace it. Anything the developer needs is at the bottom, folded away.
 */
export const TranslationDetail = ({ id, bridge, comparison, next, canEdit, onDirtyChange, select, close }: {
  id: string;
  bridge: BackofficeBridge;
  /** The language being compared against, when one is chosen. Read-only context, shown first. */
  comparison?: { locale: string; name: string; value: string | null };
  /** The row after this one, so a reviewer can work down the list without returning to it. */
  next?: string;
  /**
   * Whether this user may write translations. The API enforces it either way; without it here the
   * editor offers a field to type in and a Save button that can only ever fail.
   */
  canEdit: boolean;
  onDirtyChange: (dirty: boolean) => void;
  select: (messageId: string) => void;
  close: () => void;
}) => {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: queryKeys.message(id), queryFn: ({ signal }) => api.message(id, signal) });
  const [draft, setDraft] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  const message = detail.data;
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

  // Focus goes to the field being filled in, not the heading: the drawer exists to be typed into.
  useEffect(() => {
    const target = canEdit ? field.current ?? heading.current : heading.current;
    target?.focus();
    // At the end of what is already there, rather than selecting it, so a keystroke does not wipe
    // an existing translation.
    if (target instanceof HTMLTextAreaElement) target.setSelectionRange(target.value.length, target.value.length);
  }, [id, canEdit, message !== undefined]);

  // Grows with what is typed instead of scrolling inside a fixed box, up to a share of the drawer.
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }, [value, id]);

  /**
   * The list and the counts have to be refetched, but the message itself does not: the write
   * returned its own result, so seeding the cache with that shows the saved text immediately.
   * Invalidating instead left the field blank until the refetch landed, which reads as the save
   * having wiped it.
   */
  const settle = (saved?: MessageDetail) => {
    setDraft(undefined);
    onDirtyChange(false);
    if (saved) queryClient.setQueryData(queryKeys.message(id), saved);
    void queryClient.invalidateQueries({ queryKey: queryKeys.keys() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.facets() });
  };

  const identity = (detail: MessageDetail) => ({
    sourceId: detail.sourceId,
    namespace: detail.namespace,
    key: detail.key,
    locale: detail.locale,
  });

  const save = useMutation({
    mutationFn: ({ value }: { value: string; then: "close" | "next" }) =>
      api.saveOverride({ ...identity(message!), value, expectedVersion: message?.version ?? undefined }),
    // Saving leaves the editor, the same as reverting does: the row behind it shows the new text
    // and its status, which is the confirmation. Nothing is announced -- a toast would land on the
    // button just pressed and repeat what the list already says. Failures still notify, because
    // nothing else would say so, and the drawer stays open with the text intact to fix.
    onSuccess: (saved, variables) => {
      settle(saved);
      if (variables.then === "next" && next) select(next);
      else close();
    },
    onError: (error) => bridge.notify("danger", "Translation could not be saved", error.message),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.resetOverride({ ...identity(message!), expectedVersion: message?.version ?? undefined }),
    onSuccess: () => { settle(); close(); },
    onError: (error) => bridge.notify("danger", "Translation could not be reset", error.message),
  });

  const savable = canEdit && dirty && !problem && !save.isPending;
  const commit = (then: "close" | "next") => {
    if (savable && draft !== undefined) save.mutate({ value: draft, then });
  };

  // Escape leaves; the drawer covers the list, so leaving focus behind would strand a keyboard user
  // behind an overlay. Ctrl/Cmd+S saves, which is the shortcut anyone typing into a field reaches
  // for, and it has to be caught here or the browser offers to save the page instead.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commit("close");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const language = message ? nameOf(message.locale) : "";

  return (
    <aside className="drawer" role="complementary" aria-label="Edit translation">
      <div className="drawer__head">
        <div className="drawer__title">
          <h2 ref={heading} tabIndex={-1}>{effective(message) ?? "Loading…"}</h2>
          {message && (
            <p className="drawer__id">
              <span className="meta__key">{message.key}</span>
              <span className="meta__namespace">{message.namespace}</span>
            </p>
          )}
        </div>
        <Button label="Close editor" icon onClick={close}>✕</Button>
      </div>

      <div className="drawer__body">
        {detail.isLoading && <p>Loading translation…</p>}
        {detail.isError && <p className="error">{detail.error.message}</p>}

        {message && (
          <>
            {message.state === "Removed" && (
              <p className="notice notice--warning">
                ⚠ Removed from the application. This entry is kept only because it has custom text.
              </p>
            )}
            {message.needsReview && (
              <p className="notice notice--warning">
                ⚠ The application text changed after this was written. Check it still reads correctly.
              </p>
            )}

            {comparison && (
              <section className="block">
                <h3>{comparison.name} · Reference</h3>
                <p className="reading">{comparison.value ?? <em>No text in this language</em>}</p>
              </section>
            )}

            <section className="block">
              <h3>{language} · Application text</h3>
              <p className="reading">{message.defaultValue || <em>No text in this language</em>}</p>
            </section>

            <section className="block">
              <h3>
                {canEdit ? <label htmlFor="override">Custom {language}</label> : `Custom ${language}`}
              </h3>
              {/* Without permission this is something to read, so it is presented as the other two
                  readings are. A field that cannot be saved is an invitation to waste an hour. */}
              {canEdit ? (
                <textarea
                  id="override"
                  ref={field}
                  className="control"
                  rows={3}
                  aria-label={`Custom text in ${language}`}
                  aria-invalid={problem !== null}
                  aria-describedby={problem ? "override-problem" : "override-state"}
                  placeholder="Leave blank to use the application text"
                  value={value}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <p className="reading">
                  {message.overrideValue || <em>No custom text</em>}
                </p>
              )}
              {problem ? (
                <p id="override-problem" className="notice notice--error" role="alert">{problem.message}</p>
              ) : (
                <p id="override-state" className="hint">
                  {message.overrideValue === null ? "Using application text" : "Custom text"}
                </p>
              )}
            </section>

            <section className="block">
              <h3>Required placeholders</h3>
              {Object.keys(message.arguments).length === 0 ? (
                <p className="hint">None</p>
              ) : (
                <ul className="arguments">
                  {Object.entries(message.arguments).map(([name, kind]) => (
                    <li key={name} className={problem?.missing.includes(name) ? "tag tag--missing" : "tag"}>
                      {`{${name}}`}
                      <span className="tag__kind">{kind}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Everything a developer might need and an editor never does. */}
            <details className="technical">
              <summary>Technical details</summary>
              <dl>
                <dt>Key</dt>
                <dd>
                  <code>{message.namespace}.{message.key}</code>
                  <Button
                    look="secondary"
                    label="Copy full key"
                    onClick={() => void navigator.clipboard?.writeText(`${message.namespace}.${message.key}`)}
                  >
                    Copy
                  </Button>
                </dd>
                <dt>Language</dt>
                <dd>{message.locale}</dd>
                <dt>Format</dt>
                <dd>{message.format}</dd>
                <dt>Source revision</dt>
                <dd><code>{message.sourceRevision}</code></dd>
                {message.updatedAt && (
                  <>
                    <dt>Last changed</dt>
                    <dd>{new Date(message.updatedAt).toLocaleString()}{message.updatedBy ? ` by ${message.updatedBy}` : ""}</dd>
                  </>
                )}
              </dl>
            </details>
          </>
        )}
      </div>

      {/*
        No Cancel button. Leaving without saving is the close control in the header and Escape,
        both of which already ask about unsaved text, and a third way to do it was crowding the one
        action anybody came here to press. Save sits last, where the eye ends up.

        Without permission there are no actions at all, so the footer says why rather than showing
        a row of buttons that are permanently dimmed and never explain themselves.
      */}
      <div className="drawer__foot">
        {canEdit ? (
          <>
            <Button
              look="secondary"
              label="Reset to application text"
              disabled={!message || message.overrideValue === null || reset.isPending}
              onClick={() => reset.mutate()}
            >
              Reset
            </Button>
            <span className="drawer__actions">
              {/* Not a second primary button: two of them side by side leave neither reading as the
                  obvious one, and this is the shortcut for a long review rather than the usual exit. */}
              {next && (
                <Button disabled={!savable} onClick={() => commit("next")}>
                  Save &amp; next
                </Button>
              )}
              <Button look="primary" disabled={!savable} onClick={() => commit("close")}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </span>
          </>
        ) : (
          <p className="hint">You have view-only access to translations.</p>
        )}
      </div>
    </aside>
  );
};

/** The heading is the text as it stands today, which is what the row showed and what is being changed. */
const effective = (message?: MessageDetail): string | undefined =>
  message && (message.overrideValue ?? message.defaultValue) || undefined;

const NAMES = new Intl.DisplayNames(undefined, { type: "language" });

/** Falls back to the code, which is what an unknown or private-use tag deserves. */
const nameOf = (locale: string): string => {
  try {
    return NAMES.of(locale) ?? locale;
  } catch {
    return locale;
  }
};
