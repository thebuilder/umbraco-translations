import type { MessageFormat, TranslationOutputFormat } from "../../api/generated/models.js";

export const messageFormatLabel = (format: MessageFormat): string => {
  switch (format) {
    case "Icu":
      return "ICU messages";
    case "I18NextV4":
      return "i18next JSON v4";
    case "PlainText":
      return "Plain text";
    // A server newer than this bundle can name a format this build has never heard of. Its own
    // name reads better in the UI than the blank a missing branch would leave.
    default:
      return format;
  }
};

export const messageFormatOptions = (selected: MessageFormat) =>
  (["Icu", "I18NextV4", "PlainText"] as const).map((value) => ({
    name: messageFormatLabel(value),
    value,
    selected: value === selected,
  }));

export const deliveryFormatLabel = (format: TranslationOutputFormat): string => {
  switch (format) {
    case "next-intl":
      return "next-intl (ICU)";
    case "i18next-v4":
      return "i18next JSON v4";
    default:
      return format;
  }
};
