import { useMemo } from "react";
import type { MessageKey } from "../../api/generated/models.js";
import { summarise } from "../components/cell-status.js";

/**
 * The shape of the work before scrolling into it. Counts describe the rows actually loaded, which
 * is why each is phrased against that number rather than the total.
 */
export const Summary = ({ keys, locale, total }: {
  keys: readonly MessageKey[];
  locale: string | null;
  total: number;
}) => {
  const counts = useMemo(
    () => summarise(keys.map((key) => (locale ? key.cells[locale] : undefined))),
    [keys, locale],
  );

  return (
    <div className="summary">
      <strong>{total.toLocaleString()}</strong> translations
      {counts.customised > 0 && <><span className="summary__sep" />{counts.customised} customised here</>}
      {counts.needsReview > 0 && (
        <><span className="summary__sep" /><span className="summary__warn">{counts.needsReview} need review</span></>
      )}
      {counts.missing > 0 && <><span className="summary__sep" />{counts.missing} not translated</>}
    </div>
  );
};
