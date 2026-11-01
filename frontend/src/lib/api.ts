import type { JobState } from "../types";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const FALLBACK: Record<number, string> = {
  400: "The CV file was rejected. Use a valid PDF or DOCX of at most 5 MB.",
  413: "The job description is too long.",
  422: "Something is missing: add a CV and a job description.",
  503: "The system is busy right now. Please try again in a minute.",
};

/** FastAPI sends {"detail": "text"} or {"detail": [{"msg": ...}]}; fall back to a friendly text. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail) return detail;
  } catch {
    // body was not JSON: use the fallback
  }
  return FALLBACK[response.status] ?? `Unexpected error (HTTP ${response.status}).`;
}

export async function submitAnalysis(cv: File, jdText: string): Promise<string> {
  const form = new FormData();
  form.append("cv", cv);
  form.append("jd_text", jdText);

  let response: Response;
  try {
    response = await fetch("/api/analyze", { method: "POST", body: form });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));

  const body = (await response.json()) as { job_id: string };
  return body.job_id;
}

export async function getJob(jobId: string, signal?: AbortSignal): Promise<JobState> {
  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
  if (response.status === 404) {
    throw new ApiError(404, "This analysis has expired. Please start a new one.");
  }
  if (!response.ok) throw new ApiError(response.status, await errorMessage(response));
  return (await response.json()) as JobState;
}
