import { useEffect, useState } from "react";
import { cycleSeconds, doneNodes, STAGES, WORKING } from "../lib/stages";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { FlowLog } from "./FlowLog";

/**
 * The architecture view again, for after the result is on screen. It is the path every analysis
 * follows, not a recording of this one: the backend only reports the step it is in, and the fast
 * steps (verification, scoring) can pass between two polls. Each stage plays one loop, then the
 * next one starts; a click on a step jumps to it and stops the tour.
 */
export function FlowReplay() {
  const [index, setIndex] = useState(0);
  const [touring, setTouring] = useState(true);
  // Bumped on every change so the diagram and the log restart their clocks together.
  const [run, setRun] = useState(0);
  const stage = STAGES[index] ?? WORKING;

  const goTo = (next: number, tour: boolean) => {
    setIndex(next);
    setTouring(tour);
    setRun((r) => r + 1);
  };

  useEffect(() => {
    if (!touring) return;
    const timer = setTimeout(() => {
      if (index < STAGES.length - 1) goTo(index + 1, true);
      else setTouring(false);
    }, cycleSeconds(stage) * 1000);
    return () => clearTimeout(timer);
  }, [touring, index, run, stage]);

  return (
    <div className="processing">
      <section className="side">
        <div className="side-head">
          <span className="kicker mono">
            HOW IT WORKED · STEP {index + 1} / {STAGES.length}
          </span>
          <h1>{stage.title}</h1>
        </div>

        <ol className="steps clickable">
          {STAGES.map((s, i) => (
            <li key={s.step} className={i === index ? "now" : i < index ? "done" : "todo"}>
              <button
                type="button"
                aria-current={i === index ? "step" : undefined}
                onClick={() => goTo(i, false)}
              >
                <span className="step-dot" />
                {s.short}
              </button>
            </li>
          ))}
        </ol>

        <p className="explain">{stage.explain}</p>
        <p className="muted small">This is the path every analysis follows.</p>
        <button type="button" className="secondary" onClick={() => goTo(0, true)}>
          Play from the start
        </button>
      </section>

      <section className="stage">
        <ArchitectureDiagram stage={stage} done={doneNodes(index)} restartKey={run} />
        <FlowLog key={`log-${run}`} stage={stage} />
      </section>
    </div>
  );
}
