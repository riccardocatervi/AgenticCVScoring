import { useState } from "react";
import { STAGES, TOTAL_FLOWS, WORKING, doneNodes, firstPositionOf, locate } from "../lib/stages";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { FlowLog, nodeLabel } from "./FlowLog";
import { StepScrubber } from "./StepScrubber";

/**
 * The architecture view again, for after the result is on screen. It is the path every analysis
 * follows, not a recording of this one: the backend only reports the step it is in, and the fast
 * steps (verification, scoring) can pass between two polls. Nothing plays by itself: the student
 * moves through the messages at their own pace, one at a time.
 */
export function FlowReplay() {
  const [position, setPosition] = useState(0);
  // Bumped to play the current message again when it is picked a second time.
  const [again, setAgain] = useState(0);

  const { stageIndex, flowIndex } = locate(position);
  const stage = STAGES[stageIndex] ?? WORKING;
  const flow = stage.flows[flowIndex];

  const go = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), TOTAL_FLOWS - 1);
    if (clamped === position) setAgain((n) => n + 1);
    setPosition(clamped);
  };

  return (
    <div className="processing">
      <section className="side">
        <div className="side-head">
          <span className="kicker mono">
            HOW IT WORKED · STEP {stageIndex + 1} / {STAGES.length}
          </span>
          <h1>{stage.title}</h1>
        </div>

        <ol className="steps clickable">
          {STAGES.map((s, i) => (
            <li key={s.step} className={i === stageIndex ? "now" : i < stageIndex ? "done" : "todo"}>
              <button
                type="button"
                aria-current={i === stageIndex ? "step" : undefined}
                onClick={() => go(firstPositionOf(i))}
              >
                <span className="step-dot" />
                {s.short}
              </button>
            </li>
          ))}
        </ol>

        <p className="explain">{stage.explain}</p>
        <p className="muted small">
          This is the path every analysis follows. Drag the bar, or use the arrow keys, to move one
          message at a time.
        </p>
      </section>

      <section className="stage">
        <ArchitectureDiagram
          stage={stage}
          done={doneNodes(stageIndex)}
          step={flowIndex}
          restartKey={again}
        />
        <StepScrubber
          position={position}
          onChange={go}
          caption={{
            route: flow ? `${nodeLabel(flow.from)} → ${nodeLabel(flow.to)}` : "",
            payload: flow?.label ?? "",
          }}
        />
        <FlowLog
          stage={stage}
          active={flowIndex}
          onSelect={(i) => go(firstPositionOf(stageIndex) + i)}
        />
      </section>
    </div>
  );
}
