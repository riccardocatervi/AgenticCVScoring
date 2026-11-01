import { useEffect, useState } from "react";
import { PAUSE_SECONDS, SLOT_SECONDS } from "./stages";

/**
 * Which message of the loop is on its way right now (-1 during the pause), so the text log can
 * follow the animation. It starts counting when the component mounts, like the SVG animation
 * does; the parent re-mounts it with a new `key` whenever the stage changes.
 */
export function useLoopIndex(count: number): number {
  const [index, setIndex] = useState(count > 0 ? 0 : -1);

  useEffect(() => {
    if (count === 0) {
      setIndex(-1);
      return;
    }
    const cycleMs = (count * SLOT_SECONDS + PAUSE_SECONDS) * 1000;
    const started = performance.now();
    const timer = setInterval(() => {
      const t = (performance.now() - started) % cycleMs;
      const slot = Math.floor(t / (SLOT_SECONDS * 1000));
      setIndex(slot < count ? slot : -1);
    }, 100);
    return () => clearInterval(timer);
  }, [count]);

  return index;
}
