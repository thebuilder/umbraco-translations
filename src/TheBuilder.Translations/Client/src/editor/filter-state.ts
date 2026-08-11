import type { MessageStatus } from "../api/generated/models.js";

export interface EditorFilters {
  locale: string;
  namespace: string;
  query: string;
  status: MessageStatus;
  page: number;
  pageSize: number;
}

const statuses: readonly MessageStatus[] = ["All", "Default", "Overridden", "NeedsReview", "Missing"];

export const parseMessageStatus = (value: string): MessageStatus =>
  statuses.find(status => status === value) ?? "All";

export const readFilters = (): EditorFilters => {
  const params = new URLSearchParams(location.search);
  const status = params.get("status") ?? "All";
  return {
    locale: params.get("locale") ?? "",
    namespace: params.get("namespace") ?? "",
    query: params.get("query") ?? "",
    status: parseMessageStatus(status),
    page: Math.max(1, Number(params.get("page") ?? 1)),
    pageSize: 100,
  };
};

export const writeFilters = (filters: EditorFilters): void => {
  const params = new URLSearchParams();
  if (filters.locale) params.set("locale", filters.locale);
  if (filters.namespace) params.set("namespace", filters.namespace);
  if (filters.query) params.set("query", filters.query);
  if (filters.status !== "All") params.set("status", filters.status);
  if (filters.page !== 1) params.set("page", String(filters.page));
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
};
