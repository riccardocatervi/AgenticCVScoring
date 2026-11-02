import { doneNodes, stageFor, STAGES } from "../lib/stages";
import { useElapsed, useRotating } from "../lib/useAnalysis";
import { ArchitectureDiagram } from "./ArchitectureDiagram";
import { LoopFlowLog } from "./FlowLog";

interface Props {
  status: "queued" | "processing";
  step: string | null;
  startedAt: number | null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ProcessingView({ status, step, startedAt }: Props) {
  const { stage, index } = stageFor(status, step);
  const phrase = useRotating(stage.phrases, 3200);
  const elapsed = useElapsed(startedAt);
  const stageKey = `${status}:${step ?? ""}`;

  return (
    <div className="processing">
      <section className="side">
        <div className="side-head">
          <span className="kicker mono">
            {index === null ? "GETTING STARTED" : `STEP ${index + 1} / ${STAGES.length}`}
            {" · "}
            {formatElapsed(elapsed)}
          </span>
          <h1>{stage.title}</h1>
          <p className="phrase" aria-live="polite" key={phrase}>
            {phrase}
          </p>
        </div>

        <ol className="steps">
          {STAGES.map((s, i) => {
            const state = index === null ? "todo" : i < index ? "done" : i === index ? "now" : "todo";
            return (
              <li key={s.step} className={state} aria-current={state === "now" ? "step" : undefined}>
                <span className="step-dot" />
                {s.short}
              </li>
            );
          })}
        </ol>

        <p className="explain">{stage.explain}</p>
      </section>

      <section className="stage">
        <ArchitectureDiagram stage={stage} done={doneNodes(index)} />
        <LoopFlowLog key={`log-${stageKey}`} stage={stage} />
      </section>
    </div>
  );
}
