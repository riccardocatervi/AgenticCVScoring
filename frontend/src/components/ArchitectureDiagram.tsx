import { useLayoutEffect, useRef } from "react";
import {
  STEP_REST,
  STEP_SECONDS,
  cycleSeconds,
  slotWindow,
  type EdgeId,
  type NodeId,
  type Stage,
} from "../lib/stages";

// One coordinate system (880 x 540) for everything: lines, boxes and moving messages.
const VIEW_W = 880;
const VIEW_H = 540;

interface NodeSpec {
  label: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  kind: "core" | "support" | "plain";
  note?: string;
}

const NODES: Record<NodeId, NodeSpec> = {
  registry: { label: "Registry", cx: 120, cy: 50, w: 150, h: 44, kind: "support" },
  orchestrator: { label: "Orchestrator", cx: 440, cy: 50, w: 210, h: 44, kind: "core" },
  memory: { label: "Memory", cx: 760, cy: 50, w: 150, h: 44, kind: "support" },
  jd_analyst: { label: "JD Analyst", cx: 150, cy: 210, w: 190, h: 48, kind: "plain", note: "no tools" },
  cv_matcher: { label: "CV Matcher", cx: 440, cy: 210, w: 190, h: 48, kind: "plain" },
  evaluator: { label: "Evaluator", cx: 730, cy: 210, w: 190, h: 48, kind: "plain" },
  gateway: { label: "Tool Gateway", cx: 440, cy: 370, w: 620, h: 48, kind: "plain", note: "MCP" },
  cv_service: { label: "CV service", cx: 150, cy: 500, w: 190, h: 44, kind: "plain" },
  verify_service: { label: "Verify service", cx: 440, cy: 500, w: 190, h: 44, kind: "plain" },
  scoring_service: { label: "Scoring service", cx: 730, cy: 500, w: 190, h: 44, kind: "plain" },
};

// Each path runs away from the Orchestrator / downwards: a message with `reverse` goes the other way.
const EDGES: Record<EdgeId, string> = {
  registry: "M335,50 L195,50",
  memory: "M545,50 L685,50",
  orch_jd: "M440,72 C440,140 150,130 150,186",
  orch_matcher: "M440,72 L440,186",
  orch_eval: "M440,72 C440,140 730,130 730,186",
  matcher_gw: "M440,234 L440,346",
  eval_gw: "M730,234 C730,300 650,300 650,346",
  gw_cv: "M230,394 C230,440 150,430 150,478",
  gw_verify: "M440,394 L440,478",
  gw_scoring: "M650,394 C650,440 730,430 730,478",
};

const fmt = (n: number) => n.toFixed(4);

/** keyTimes/values that make an element visible only inside the given windows of one loop. */
function visibility(windows: { start: number; end: number }[]) {
  const times: number[] = [0];
  const values: number[] = [0];
  for (const { start, end } of windows) {
    const ramp = Math.min(0.01, (end - start) / 4);
    times.push(start, start + ramp, end - ramp, end);
    values.push(0, 1, 1, 0);
  }
  times.push(1);
  values.push(0);
  return { keyTimes: times.map(fmt).join(";"), values: values.join(";") };
}

interface Props {
  stage: Stage;
  done: Set<NodeId>;
  /** Change it to start the loop again from its first message (same stage). */
  restartKey?: number;
  /**
   * Show only this message of the stage: it crosses its edge once and stays at the end, so it can
   * be read at any speed. Without it the whole stage loops by itself.
   */
  step?: number;
}

export function ArchitectureDiagram({ stage, done, restartKey = 0, step }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stageId = stage.step ?? stage.title;

  // The boxes stay mounted across stages so their colours can fade; only the moving parts below
  // are replaced. SMIL counts from the moment the <svg> appeared, so rewind its clock whenever a
  // new loop starts: the messages then begin together with the text log.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setCurrentTime(0);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      svg.pauseAnimations();
      // No travelling: a single message jumps straight to where it ends. A loop just stays still,
      // and the lit boxes and the log carry the story.
      if (step !== undefined) svg.setCurrentTime(STEP_SECONDS);
    } else {
      svg.unpauseAnimations();
    }
  }, [stageId, restartKey, step]);

  const busy = new Set(stage.nodes);
  const single = step === undefined ? undefined : stage.flows[step];
  const ends = new Set<NodeId>(single ? [single.from, single.to] : []);
  const cycle = cycleSeconds(stage);
  const count = stage.flows.length;

  const windowsByEdge = new Map<EdgeId, { start: number; end: number }[]>();
  stage.flows.forEach((flow, position) => {
    const list = windowsByEdge.get(flow.edge) ?? [];
    list.push(slotWindow(position, count));
    windowsByEdge.set(flow.edge, list);
  });

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="diagram"
      role="img"
      aria-label="Architecture of the system. The parts that are working are highlighted and messages move between them."
    >
      <defs>
        {(Object.keys(EDGES) as EdgeId[]).map((id) => (
          <path key={id} id={`edge-${id}`} d={EDGES[id]} />
        ))}
      </defs>

      <g className="edge-base">
        {(Object.keys(EDGES) as EdgeId[]).map((id) => (
          <use key={id} href={`#edge-${id}`} />
        ))}
      </g>

      {/* the part of the line a message is crossing right now turns black */}
      <g className="edge-lit" key={`lit-${stageId}-${restartKey}-${step ?? "loop"}`}>
        {single && <use href={`#edge-${single.edge}`} />}
        {!single && [...windowsByEdge.entries()].map(([id, windows]) => {
          const { keyTimes, values } = visibility(windows);
          return (
            <use key={id} href={`#edge-${id}`} opacity="0">
              <animate
                attributeName="opacity"
                dur={`${cycle}s`}
                repeatCount="indefinite"
                keyTimes={keyTimes}
                values={values}
              />
            </use>
          );
        })}
      </g>

      {(Object.keys(NODES) as NodeId[]).map((id) => {
        const node = NODES[id];
        const state = busy.has(id) ? "busy" : done.has(id) ? "done" : "idle";
        const x = node.cx - node.w / 2;
        const y = node.cy - node.h / 2;
        return (
          <g key={id} className={`node ${node.kind} ${state}${ends.has(id) ? " ends" : ""}`}>
            <rect x={x} y={y} width={node.w} height={node.h} rx={node.h / 2} />
            <circle className="status" cx={x + 22} cy={node.cy} r="5" />
            <text className="label" x={node.cx + 8} y={node.cy + 5}>
              {node.label}
            </text>
            {node.note && id === "gateway" && (
              <text className="note" x={x + node.w - 26} y={node.cy + 4} textAnchor="end">
                {node.note}
              </text>
            )}
            {node.note && id !== "gateway" && (
              <text className="note" x={node.cx} y={y + node.h + 22} textAnchor="middle">
                {node.note}
              </text>
            )}
          </g>
        );
      })}

      {/* one chip per message; each one moves during its own slot of the loop */}
      <g className="packets" key={`packets-${stageId}-${restartKey}-${step ?? "loop"}`}>
        {single && (
          <g>
            <animateMotion
              dur={`${STEP_SECONDS}s`}
              fill="freeze"
              calcMode="spline"
              keyTimes="0;1"
              keySplines="0.16 1 0.3 1"
              keyPoints={single.reverse ? `1;${1 - STEP_REST}` : `0;${STEP_REST}`}
            >
              <mpath href={`#edge-${single.edge}`} />
            </animateMotion>
            <rect
              x={-(Math.round(single.label.length * 7.1 + 24)) / 2}
              y="-12"
              width={Math.round(single.label.length * 7.1 + 24)}
              height="24"
              rx="12"
            />
            <text y="4">{single.label}</text>
          </g>
        )}
        {!single && stage.flows.map((flow, position) => {
          const { start, end } = slotWindow(position, count);
          const width = Math.round(flow.label.length * 7.1 + 24);
          const { keyTimes, values } = visibility([{ start, end }]);
          return (
            <g key={`${position}-${flow.label}`} opacity="0">
              <animateMotion
                dur={`${cycle}s`}
                repeatCount="indefinite"
                calcMode="linear"
                keyPoints={flow.reverse ? "1;1;0;0" : "0;0;1;1"}
                keyTimes={`0;${fmt(start)};${fmt(end)};1`}
              >
                <mpath href={`#edge-${flow.edge}`} />
              </animateMotion>
              <animate
                attributeName="opacity"
                dur={`${cycle}s`}
                repeatCount="indefinite"
                keyTimes={keyTimes}
                values={values}
              />
              <rect x={-width / 2} y="-12" width={width} height="24" rx="12" />
              <text y="4">{flow.label}</text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
