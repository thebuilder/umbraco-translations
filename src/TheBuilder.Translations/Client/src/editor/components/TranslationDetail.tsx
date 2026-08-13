import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/generated/client.js";
import type { BackofficeBridge } from "../../bridge/backoffice-bridge.js";
import { Button } from "../../bridge/uui/index.js";
import type { MessageDetail } from "../../api/generated/models.js";

/** Writes are addressed by identity, which the detail response carries for exactly this reason. */
const identityOf = (message: MessageDetail | undefined) => ({
  sourceId: message?.sourceId ?? "",
  namespace: message?.namespace ?? "",
  key: message?.key ?? "",
  locale: message?.locale ?? "",
});

export const TranslationDetail = ({ id, bridge, close }: { id: string; bridge: BackofficeBridge; close: () => void }) => {
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["message", id], queryFn: () => api.message(id) });
  const [draft, setDraft] = useState<string>();
  const refresh = async () => {
    setDraft(undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["messages"] }),
      queryClient.invalidateQueries({ queryKey: ["message", id] }),
    ]);
  };
  const save = useMutation({
    mutationFn: (value: string) => api.saveOverride({
      ...identityOf(detail.data),
      value,
      expectedVersion: detail.data?.version ?? undefined,
    }),
    onSuccess: async () => { bridge.notify("positive", "Translation saved"); await refresh(); },
    onError: error => bridge.notify("danger", "Translation could not be saved", error.message),
  });
  const reset = useMutation({
    mutationFn: () => api.resetOverride({
      ...identityOf(detail.data),
      expectedVersion: detail.data?.version ?? undefined,
    }),
    onSuccess: async () => {
      bridge.notify("positive", "Translation reset");
      await queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.removeQueries({ queryKey: ["message", id] });
      close();
    },
    onError: error => bridge.notify("danger", "Translation could not be reset", error.message),
  });

  if (detail.isLoading) return <aside className="panel detail"><p>Loading translation…</p></aside>;
  if (detail.isError) return <aside className="panel detail"><p className="error">{detail.error.message}</p></aside>;
  if (!detail.data) return null;

  const message = detail.data;
  const removed = message.state === "Missing";
  return <aside className="panel detail">
    <h2 className="key">{message.key}</h2>
    <p className="muted">{message.namespace} · {message.locale}</p>
    {removed && <p className="tag tag--warning">Removed from the source. This entry is retained only because it has custom text.</p>}
    <div className="field">
      <label>{removed ? "Last source value" : "Application default"}</label>
      <div className="panel">{message.defaultValue || <em>Empty string</em>}</div>
    </div>
    {Object.keys(message.arguments).length > 0 && <>
      <h3>Required arguments</h3>
      <div className="argument-list">{Object.entries(message.arguments).map(([name, kind]) =>
        <span className="tag" key={name}>{name}: {kind}</span>)}</div>
    </>}
    <div className="field">
      <label htmlFor="override">Custom text</label>
      <textarea id="override" value={draft ?? message.overrideValue ?? ""} onChange={event => setDraft(event.target.value)} placeholder="Enter custom text" />
    </div>
    <div className="actions">
      <Button look="primary" disabled={save.isPending || draft === undefined} onClick={() => draft !== undefined && save.mutate(draft)}>Save override</Button>
      <Button disabled={message.overrideValue == null || reset.isPending} onClick={() => reset.mutate()}>{removed ? "Delete override" : "Reset to default"}</Button>
    </div>
    {message.needsReview && <p className="tag tag--warning">The application default changed after this override was edited.</p>}
  </aside>;
};
