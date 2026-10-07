/**
 * Marks drawn rather than typed.
 *
 * `↑`, `↓` and `✕` are text glyphs, so their size and vertical metrics come from whichever font in
 * the stack carries them, which is rarely the one the rest of the interface uses. They render large
 * in some faces and tiny in others, and they sit on the text baseline rather than in the middle of
 * the box. That is how three buttons of identical size held three marks at three different heights.
 *
 * A path is the same shape everywhere, and it centres on the box it is given.
 */
export const Chevron = ({
  direction,
  className,
}: {
  direction: "up" | "down";
  className?: string;
}) => (
  <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 10 6">
    <path
      d={direction === "down" ? "M1 1.25 5 4.75 9 1.25" : "M1 4.75 5 1.25 9 4.75"}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

export const Cross = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 10 10">
    <path
      d="M1.75 1.75 8.25 8.25M8.25 1.75 1.75 8.25"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
    />
  </svg>
);

/** The mark on the assistant's actions: a four-pointed spark, the shape AI features have settled on. */
export const Spark = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 12 12">
    <path
      d="M6 1.25c.35 2.45 1.3 3.4 3.75 3.75C7.3 5.35 6.35 6.3 6 8.75 5.65 6.3 4.7 5.35 2.25 5 4.7 4.65 5.65 3.7 6 1.25Z"
      fill="currentColor"
    />
    <path
      d="M9.5 8.25c.15 1 .5 1.35 1.5 1.5-1 .15-1.35.5-1.5 1.5-.15-1-.5-1.35-1.5-1.5 1-.15 1.35-.5 1.5-1.5Z"
      fill="currentColor"
    />
  </svg>
);

/** Two arrows passing each other: the two sides trade places. */
export const Swap = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} focusable="false" viewBox="0 0 14 12">
    <path
      d="M1.5 3.5h10M9 1l2.5 2.5L9 6M12.5 8.5h-10M5 6 2.5 8.5 5 11"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
    />
  </svg>
);
