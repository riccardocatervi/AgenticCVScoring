import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult, JobStatus } from "../types";
import { ApiError, getJob, submitAnalysis } from "./api";

export type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "running"; status: Extract<JobStatus, "queued" | "processing">; step: string | null }
  | { kind: "done"; result: AnalysisResult }
  | { kind: "error"; message: string };

const POLL_MS = 1500;
const MAX_NETWORK_FAILURES = 4;

/** Submits a job, polls it until it ends, and exposes one `phase` for the UI to render. */
export function useAnalysis() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [jobId, setJobId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  useEffect(() => {
    if (jobId === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      try {
        const job = await getJob(jobId, controller.signal);
        failures = 0;
        if (job.status === "done" && job.result) {
          setPhase({ kind: "done", result: job.result });
          return;
        }
        if (job.status === "failed" || job.status === "done") {
          setPhase({
            kind: "error",
            message: job.error ?? "The analysis failed. Please try again.",
          });
          return;
        }
        setPhase({ kind: "running", status: job.status, step: job.step });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A 404 or a 4xx is final. A dropped connection gets a few more tries.
        const final = error instanceof ApiError && error.status !== 0 && error.status < 500;
        failures += 1;
        if (final || failures >= MAX_NETWORK_FAILURES) {
          setPhase({
            kind: "error",
            message: error instanceof ApiError ? error.message : "Lost connection to the server.",
          });
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId]);

  const start = useCallback(async (cv: File, jdText: string) => {
    setPhase({ kind: "submitting" });
    try {
      const id = await submitAnalysis(cv, jdText);
      setStartedAt(Date.now());
      setPhase({ kind: "running", status: "queued", step: null });
      setJobId(id);
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  }, []);

  const reset = useCallback(() => {
    setJobId(null);
    setStartedAt(null);
    setPhase({ kind: "idle" });
  }, []);

  return { phase, startedAt, start, reset };
}

/** Cycles through `items` every `ms`; restarts from the first one when `items` changes. */
export function useRotating<T>(items: readonly T[], ms: number): T | undefined {
  const [index, setIndex] = useState(0);
  const first = useRef(items);

  useEffect(() => {
    if (first.current !== items) {
      first.current = items;
      setIndex(0);
    }
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ms);
    return () => clearInterval(timer);
  }, [items, ms]);

  return items[index % items.length];
}

/** Seconds since `startedAt`, updated every second. */
export function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return startedAt === null ? 0 : Math.max(0, Math.floor((now - startedAt) / 1000));
}
