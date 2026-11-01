// What the backend does, told as a story for the architecture view.
//
// The backend only sends a `step` string while a job is processing (see on_step in
// backend/src/cvscore/agents/orchestrator.py). We map each known string to the boxes that are busy
// and to the messages travelling between them. An unknown string falls back to a generic stage,
// so a renamed step in the backend degrades the animation but never breaks the page.

export type NodeId =
  | "registry"
  | "orchestrator"
  | "memory"
  | "jd_analyst"
  | "cv_matcher"
  | "evaluator"
  | "gateway"
  | "cv_service"
  | "verify_service"
  | "scoring_service";

/** Every edge is drawn away from the Orchestrator / downwards; `reverse` flips a message. */
export type EdgeId =
  | "registry"
  | "memory"
  | "orch_jd"
  | "orch_matcher"
  | "orch_eval"
  | "matcher_gw"
  | "eval_gw"
  | "gw_cv"
  | "gw_verify"
  | "gw_scoring";

/** One message travelling along an edge. */
export interface Flow {
  from: NodeId;
  to: NodeId;
  edge: EdgeId;
  /** True when the message goes against the edge's drawing direction. */
  reverse: boolean;
  /** The data in the message, shown on the moving chip and in the log. */
  label: string;
}

export interface Stage {
  /** Exact `step` text sent by the backend. */
  step: string | null;
  /** One line for the step list. */
  short: string;
  title: string;
  explain: string;
  /** Rotating status lines shown under the title. */
  phrases: string[];
  nodes: NodeId[];
  flows: Flow[];
}

/** Seconds each message takes to cross its edge. */
export const SLOT_SECONDS = 1.2;
/** Silent seconds at the end of a loop, before the first message leaves again. */
export const PAUSE_SECONDS = 0.6;

export function cycleSeconds(stage: Stage): number {
  return stage.flows.length === 0 ? 0 : stage.flows.length * SLOT_SECONDS + PAUSE_SECONDS;
}

const out = (from: NodeId, to: NodeId, edge: EdgeId, label: string): Flow => ({
  from,
  to,
  edge,
  reverse: false,
  label,
});
const back = (from: NodeId, to: NodeId, edge: EdgeId, label: string): Flow => ({
  from,
  to,
  edge,
  reverse: true,
  label,
});

export const QUEUED: Stage = {
  step: null,
  short: "Waiting for a free worker",
  title: "Waiting for a free worker.",
  explain:
    "Your request is in a queue. A few workers process jobs in parallel, so with many students at once you may wait a little.",
  phrases: [
    "Your request is in the queue…",
    "The Orchestrator will pick it up soon…",
    "Hang tight, a worker is about to be free…",
  ],
  nodes: [],
  flows: [],
};

export const STARTING: Stage = {
  step: null,
  short: "Planning",
  title: "The Orchestrator is planning.",
  explain:
    "The Orchestrator reads the Registry to see which sub-agents exist and what each one may do, then creates a memory for this job.",
  phrases: [
    "The Orchestrator is reading the Registry…",
    "Planning which sub-agent goes first…",
    "Creating the job memory…",
  ],
  nodes: ["orchestrator", "registry", "memory"],
  flows: [
    out("orchestrator", "registry", "registry", "who can do what?"),
    back("registry", "orchestrator", "registry", "agent list"),
    out("orchestrator", "memory", "memory", "create job memory"),
  ],
};

export const STAGES: Stage[] = [
  {
    step: "Analyzing the job description",
    short: "JD Analyst reads the job description",
    title: "The JD Analyst is reading the job description.",
    explain:
      "This agent has no tools at all. It only turns the job description into a fixed list of requirements, which also keeps any hidden instructions in the text away from the other agents.",
    phrases: [
      "JD Analyst is thinking…",
      "The requirements are being extracted…",
      "Sorting must-haves from nice-to-haves…",
      "Turning free text into a strict schema…",
    ],
    nodes: ["orchestrator", "jd_analyst", "memory"],
    flows: [
      out("orchestrator", "jd_analyst", "orch_jd", "job description"),
      back("jd_analyst", "orchestrator", "orch_jd", "requirements[ ]"),
      out("orchestrator", "memory", "memory", "save requirements"),
    ],
  },
  {
    step: "Searching the CV for evidence",
    short: "CV Matcher searches your CV",
    title: "The CV Matcher is searching your CV.",
    explain:
      "This is a real agent: it decides which searches to run and when it has enough evidence. Every search goes through the Tool Gateway to a deterministic service.",
    phrases: [
      "CV Matcher is thinking…",
      "Searching your CV for proof of each requirement…",
      "Looking for a quote that backs the claim…",
      "No evidence? It will honestly say no…",
    ],
    nodes: ["orchestrator", "cv_matcher", "gateway", "cv_service", "memory"],
    flows: [
      out("orchestrator", "cv_matcher", "orch_matcher", "requirements[ ]"),
      out("cv_matcher", "gateway", "matcher_gw", 'search_cv("docker")'),
      out("gateway", "cv_service", "gw_cv", "tools/call"),
      back("cv_service", "gateway", "gw_cv", "3 snippets"),
      back("gateway", "cv_matcher", "matcher_gw", "snippets"),
      back("cv_matcher", "orchestrator", "orch_matcher", "match + quote"),
      out("orchestrator", "memory", "memory", "save matches"),
    ],
  },
  {
    step: "Verifying the quotes against the CV",
    short: "Evaluator checks every quote",
    title: "The Evaluator is checking every quote.",
    explain:
      "Language models can invent things. A deterministic service checks that every quote really exists in your CV. A quote that does not is thrown out.",
    phrases: [
      "Evaluator is checking the evidence…",
      "Comparing each quote with your CV text…",
      "Catching anything the model made up…",
    ],
    nodes: ["orchestrator", "evaluator", "gateway", "verify_service"],
    flows: [
      out("orchestrator", "evaluator", "orch_eval", "matches + quotes"),
      out("evaluator", "gateway", "eval_gw", 'verify_evidence("…")'),
      out("gateway", "verify_service", "gw_verify", "tools/call"),
      back("verify_service", "gateway", "gw_verify", "found: true"),
      back("gateway", "evaluator", "eval_gw", "verified"),
      back("evaluator", "orchestrator", "orch_eval", "verified matches"),
    ],
  },
  {
    step: "Computing the score",
    short: "Code computes the score",
    title: "The score is computed by code.",
    explain:
      "The model never invents the number. It gives a verdict per requirement and a plain formula does the math: a must-have counts 3, a nice-to-have counts 1.",
    phrases: [
      "Applying the scoring formula…",
      "Weighing must-haves three times more…",
      "Crunching the numbers…",
    ],
    nodes: ["orchestrator", "evaluator", "gateway", "scoring_service"],
    flows: [
      out("orchestrator", "evaluator", "orch_eval", "verified matches"),
      out("evaluator", "gateway", "eval_gw", "compute_score(…)"),
      out("gateway", "scoring_service", "gw_scoring", "tools/call"),
      back("scoring_service", "gateway", "gw_scoring", "score"),
      back("gateway", "evaluator", "eval_gw", "score"),
      back("evaluator", "orchestrator", "orch_eval", "score + breakdown"),
    ],
  },
  {
    step: "Writing suggestions",
    short: "Evaluator writes suggestions",
    title: "The Evaluator is writing your suggestions.",
    explain:
      "Last step: advice on the gaps. It has to stay honest, so it says “if you used X, mention it” and never “add X” when X is not in your CV.",
    phrases: [
      "Evaluator is thinking…",
      "Writing honest suggestions…",
      "Almost there, polishing the advice…",
    ],
    nodes: ["orchestrator", "evaluator", "memory"],
    flows: [
      out("orchestrator", "evaluator", "orch_eval", "the gaps"),
      back("evaluator", "orchestrator", "orch_eval", "suggestions"),
      out("orchestrator", "memory", "memory", "save result"),
    ],
  },
];

export const WORKING: Stage = {
  step: null,
  short: "Working",
  title: "The agents are working.",
  explain: "The Orchestrator keeps delegating work until the goal is reached.",
  phrases: ["The Orchestrator is coordinating the agents…", "Still working on it…"],
  nodes: ["orchestrator"],
  flows: [],
};

export interface StageView {
  stage: Stage;
  /** 0-based position among the five known steps, or null for queued/unknown. */
  index: number | null;
}

export function stageFor(status: "queued" | "processing", step: string | null): StageView {
  if (status === "queued") return { stage: QUEUED, index: null };
  if (step === null) return { stage: STARTING, index: null };
  const index = STAGES.findIndex((s) => s.step === step);
  const known = STAGES[index];
  return known ? { stage: known, index } : { stage: WORKING, index: null };
}

/** Boxes that finished their part: busy in an earlier stage, not busy now. */
export function doneNodes(index: number | null): Set<NodeId> {
  const done = new Set<NodeId>();
  if (index === null) return done;
  const current = new Set(STAGES[index]?.nodes ?? []);
  for (const earlier of STAGES.slice(0, index)) {
    for (const node of earlier.nodes) if (!current.has(node)) done.add(node);
  }
  return done;
}

/** SMIL keyTimes (0..1, one loop) for the message at `position` of `count`. */
export function slotWindow(position: number, count: number): { start: number; end: number } {
  const cycle = count * SLOT_SECONDS + PAUSE_SECONDS;
  return {
    start: (position * SLOT_SECONDS) / cycle,
    end: ((position + 1) * SLOT_SECONDS) / cycle,
  };
}
