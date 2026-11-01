import { doneNodes, stageFor, STAGES, type Stage } from "../lib/stages";
import { useElapsed, useRotating } from "../lib/useAnalysis";
import { useLoopIndex } from "../lib/useLoop";
import { ArchitectureDiagram } from "./ArchitectureDiagram";

const LABEL: Record<string, string> = {
  registry: "Registry",
  orchestrator: "Orchestrator",
  memory: "Memory",
  jd_analyst: "JD Analyst",
  cv_matcher: "CV Matcher",
  evaluator: "Evaluator",
  gateway: "Tool Gateway",
  cv_service: "CV service",
  verify_service: "Verify service",
  scoring_service: "Scoring service",
};

interface Props {
  status: "queued" | "processing";
  step: string | null;
  startedAt: number | null;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The text log lives in its own component so a new `key` restarts its clock with the animation. */
function FlowLog({ stage }: { stage: Stage }) {
  const active = useLoopIndex(stage.flows.length);
  if (stage.flows.length === 0) return null;
  return (
    <ol className="flow-log" aria-label="Messages between the parts of the system">
      {stage.flows.map((flow, i) => (
        <li key={i} className={i === active ? "active" : undefined}>
          <span className="mono">{String(i + 1).padStart(2, "0")}</span>
          <span>
            {LABEL[flow.from]} → {LABEL[flow.to]}
          </span>
          <span className="mono payload">{flow.label}</span>
        </li>
      ))}
    </ol>
  );
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
        <ArchitectureDiagram key={`diagram-${stageKey}`} stage={stage} done={doneNodes(index)} />
        <FlowLog key={`log-${stageKey}`} stage={stage} />
      </section>
    </div>
  );
}
