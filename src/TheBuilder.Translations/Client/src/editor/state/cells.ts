import type { MessageCell, MessageKey } from "../../api/generated/models.js";
import { localeIn } from "./locales.js";

/** A key's cell in one language, or undefined where it has none. */
export const cellOf = (
  key: MessageKey | undefined,
  locale: string | null | undefined
): MessageCell | undefined => (key ? localeIn(key.cells, locale) : undefined);

/** The text the site serves for a cell: the editor's own where there is any, else the default. */
export const textOf = (cell: MessageCell | undefined): string | null =>
  cell === undefined ? null : (cell.overrideValue ?? cell.defaultValue);
