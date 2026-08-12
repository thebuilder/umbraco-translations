import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/generated/client.js";
import type { MessageDetail } from "../../api/generated/models.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button, Tag, Textarea } from "../../bridge/uui/index.js";
import { queryKeys } from "../api/keys.js";

/**
 * Editing panel for one translation.
 *
 * A drawer over the list rather than a third column: at this width a column would squeeze the text
 * being compared, and opening one would resize the table out from under the row just clicked.
 */
export const TranslationDetail = ({ id, bridge, close }: {
  id: string;
  bridge: BackofficeBridge;
  close: () => void;
}) => {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: queryKeys.message(id), queryFn: ({ signal }) => api.message(id, signal) });
  const [draft, setDraft] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);

  // Focus moves to the drawer when it opens, and Escape closes it: it covers the list, so leaving
  // focus behind would strand a keyboard user behind an overlay.
  useEffect(() => heading.current?.focus(), [id]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  const refresh = async () => {
    setDraft(undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.keys() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.message(id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.facets() }),
    ]);
  };

  const identity = (message: MessageDetail) => ({
    sourceId: message.sourceId,
    namespace: message.namespace,
    key: message.key,
    locale: message.locale,
  });

  const save = useMutation({
    mutationFn: (value: string) =>
      api.saveOverride({ ...identity(detail.data!), value, expectedVersion: detail.data?.version ?? undefined }),
    // No toast on success. The row behind the drawer updates and its status changes, so a banner
    // adds nothing except a panel landing on top of the button that was just pressed. Failures
    // still notify, because nothing else would say so.
    onSuccess: async () => { await refresh(); },
    onError: (error) => bridge.notify("danger", "Translation could not be saved", error.message),
  });

  const reset = useMutation({
    mutationFn: () =>
      api.resetOverride({ ...identity(detail.data!), expectedVersion: detail.data?.version ?? undefined }),
    onSuccess: async () => { await refresh(); close(); },
    onError: (error) => bridge.notify("danger", "Translation could not be reset", error.message),
  });

  const message = detail.data;
  const value = draft ?? message?.overrideValue ?? "";
  const dirty = draft !== undefined && draft !== (message?.overrideValue ?? "");

  return (
    <aside className="drawer" role="complementary" aria-label="Edit translation">
      <div className="drawer__head">
        <div>
          {message && <div className="namespace">{message.namespace}</div>}
          <h2 ref={heading} tabIndex={-1} className="key">
            {message?.key ?? "Loading…"}
          </h2>
        </div>
        <Button label="Close" compact onClick={close}>✕</Button>
      </div>

      <div className="drawer__body">
        {detail.isLoading && <p>Loading translation…</p>}
        {detail.isError && <p className="error">{detail.error.message}</p>}

        {message && (
          <>
            {message.state === "Removed" && (
              <p className="status status--warning">
                ⚠ Removed from the application. This entry is kept only because it has custom text.
              </p>
            )}
            {message.needsReview && (
              <p className="status status--warning">
                ⚠ The application default changed after this text was written. Check it still reads correctly.
              </p>
            )}

            <div className="field">
              <label>Application default</label>
              <div className="readonly">{message.defaultValue || <em>No text in this locale</em>}</div>
            </div>

            {Object.keys(message.arguments).length > 0 && (
              <div className="field">
                <label>Required placeholders</label>
                <div className="arguments">
                  {Object.entries(message.arguments).map(([name, kind]) => (
                    <Tag key={name}>{`{${name}} · ${kind}`}</Tag>
                  ))}
                </div>
                <span className="hint">Your text has to use the same placeholders.</span>
              </div>
            )}

            <div className="field">
              <label htmlFor="override">Custom text · {message.locale}</label>
              <Textarea
                label={`Custom text for ${message.locale}`}
                placeholder="Leave blank to use the application text"
                value={value}
                rows={6}
                onValueChange={setDraft}
              />
              <span className="hint">
                {message.overrideValue === null
                  ? "Nothing custom yet, so the application text above is used."
                  : "Clear this and save to go back to the application text."}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="drawer__foot drawer__foot--split">
        <Button
          look="secondary"
          disabled={!message || message.overrideValue === null || reset.isPending}
          onClick={() => reset.mutate()}
        >
          Use application text
        </Button>
        <span className="drawer__actions">
          <Button onClick={close}>Cancel</Button>
          <Button
            look="primary"
            disabled={!dirty || save.isPending}
            onClick={() => draft !== undefined && save.mutate(draft)}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </span>
      </div>
    </aside>
  );
};
