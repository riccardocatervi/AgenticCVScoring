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

export const nodeLabel = (id: string): string => LABEL[id] ?? id;

interface Props {
  stage: Stage;
  /** Index of the message to highlight, or -1 for none. */
  active: number;
  /** When given, every row becomes a button that jumps to that message. */
  onSelect?: (index: number) => void;
}

/** The list of messages of one stage. Shows which one is on its way; the caller decides which. */
export function FlowLog({ stage, active, onSelect }: Props) {
  if (stage.flows.length === 0) return null;
  return (
    <ol className="flow-log" aria-label="Messages between the parts of the system">
      {stage.flows.map((flow, i) => {
        const row = (
          <>
            <span className="mono">{String(i + 1).padStart(2, "0")}</span>
            <span>
              {nodeLabel(flow.from)} → {nodeLabel(flow.to)}
            </span>
            <span className="mono payload">{flow.label}</span>
          </>
        );
        return (
          <li key={i} className={i === active ? "active" : undefined}>
            {onSelect ? (
              <button
                type="button"
                className="log-row"
                aria-current={i === active ? "true" : undefined}
                onClick={() => onSelect(i)}
              >
                {row}
              </button>
            ) : (
              <div className="log-row">{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The log that follows the looping animation by its own clock. Re-mount it (new `key`) with the diagram. */
export function LoopFlowLog({ stage }: { stage: Stage }) {
  const active = useLoopIndex(stage.flows.length);
  return <FlowLog stage={stage} active={active} />;
}
