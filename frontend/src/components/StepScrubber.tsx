import type { CSSProperties } from "react";
import { STAGES, TOTAL_FLOWS, firstPositionOf } from "../lib/stages";

interface Props {
  /** Message number, 0-based, over all five stages. */
  position: number;
  onChange: (position: number) => void;
  /** What the current message says, for screen readers and the caption. */
  caption: { route: string; payload: string };
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Where a message sits along the bar, 0 to 1. The thumb centre travels the same way. */
const at = (position: number) => position / (TOTAL_FLOWS - 1);

/** A bar to move through the messages one at a time, with the five steps marked on it. */
export function StepScrubber({ position, onChange, caption }: Props) {
  const last = TOTAL_FLOWS - 1;
  const starts = new Set(STAGES.map((_, i) => firstPositionOf(i)));

  return (
    <div className="scrubber">
      <p className="scrub-caption" aria-live="polite">
        <span className="scrub-route">{caption.route}</span>
        <span className="mono payload">{caption.payload}</span>
        <span className="mono muted small scrub-count">
          {position + 1} / {TOTAL_FLOWS}
        </span>
      </p>

      <div className="scrub-row">
        <button
          type="button"
          className="step-btn"
          aria-label="Previous message"
          disabled={position <= 0}
          onClick={() => onChange(position - 1)}
        >
          <Chevron direction="left" />
        </button>

        <div className="scrub-track" style={{ "--now": at(position) } as CSSProperties}>
          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={position}
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Message to show"
            aria-valuetext={`Message ${position + 1} of ${TOTAL_FLOWS}: ${caption.route}, ${caption.payload}`}
          />
          <div className="scrub-ruler" aria-hidden="true">
            {Array.from({ length: TOTAL_FLOWS }, (_, p) => (
              <span
                key={p}
                className={starts.has(p) ? "tick start" : "tick"}
                style={{ "--at": at(p) } as CSSProperties}
              />
            ))}
            {STAGES.map((_, i) => (
              <span
                key={i}
                className="stage-no mono"
                style={{ "--at": at(firstPositionOf(i)) } as CSSProperties}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="step-btn"
          aria-label="Next message"
          disabled={position >= last}
          onClick={() => onChange(position + 1)}
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}
