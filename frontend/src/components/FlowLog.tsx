import type { Stage } from "../lib/stages";
import { useLoopIndex } from "../lib/useLoop";

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

/** The text log lives in its own component so a new `key` restarts its clock with the animation. */
export function FlowLog({ stage }: { stage: Stage }) {
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
