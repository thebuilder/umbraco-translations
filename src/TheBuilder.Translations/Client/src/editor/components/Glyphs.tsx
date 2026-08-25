/**
 * Marks drawn rather than typed.
 *
 * `↑`, `↓` and `✕` are text glyphs, so their size and their vertical metrics come from whichever
 * font in the stack happens to carry them, which is rarely the one the rest of the interface is set
 * in. They render large in some faces and tiny in others, and they sit on the text baseline rather
 * than in the middle of the box -- which is how three buttons of identical size ended up holding
 * three marks at three different heights.
 *
 * A path is the same shape in every theme on every platform, and it centres on the box it is given.
 */
export const Chevron = ({ direction, className }: {
  direction: "up" | "down";
  className?: string;
}) => (
  <svg className={className} viewBox="0 0 10 6" aria-hidden="true" focusable="false">
    <path
      d={direction === "down" ? "M1 1.25 5 4.75 9 1.25" : "M1 4.75 5 1.25 9 4.75"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Cross = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path
      d="M1.75 1.75 8.25 8.25M8.25 1.75 1.75 8.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
