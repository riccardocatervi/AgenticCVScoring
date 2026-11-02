// Mirrors docs/api-contract.md (and backend/src/cvscore/schemas). Keep the two in sync.

export type JobStatus = "queued" | "processing" | "done" | "failed";
export type Verdict = "yes" | "partial" | "no";

export interface RequirementScore {
  requirement_id: number;
  /** The requirement as extracted from the job description. */
  text: string;
  kind: "must" | "nice";
  verdict: Verdict;
  verified: boolean;
  weight: number;
  outcome: number;
  points: number;
}

export interface ScoreBreakdown {
  score: number;
  must_met: number;
  must_total: number;
  nice_met: number;
  nice_total: number;
  per_requirement: RequirementScore[];
}

export interface Suggestion {
  requirement_id: number | null;
  text: string;
}

export interface AnalysisResult {
  score: number;
  breakdown: ScoreBreakdown;
  suggestions: Suggestion[];
}

export interface JobState {
  id: string;
  status: JobStatus;
  step: string | null;
  result: AnalysisResult | null;
  error: string | null;
}
