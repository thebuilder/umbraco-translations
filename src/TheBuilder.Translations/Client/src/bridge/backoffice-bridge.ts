export type NotificationType = "positive" | "warning" | "danger";

export interface BackofficeBridge {
  notify(type: NotificationType, headline: string, message?: string): void;
}
