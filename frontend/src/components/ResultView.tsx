import { useState } from "react";
import type { AnalysisResult, Verdict } from "../types";
import { FlowReplay } from "./FlowReplay";

const VERDICT_LABEL: Record<Verdict, string> = { yes: "Yes", partial: "Partial", no: "No" };

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

function Details({ result }: { result: AnalysisResult }) {
  const { breakdown, suggestions, score } = result;
  const byId = new Map(breakdown.per_requirement.map((r) => [r.requirement_id, r]));

  return (
    <>
      <section className="score-block">
        <div className="score-main">
          <span className="kicker mono">MATCH SCORE</span>
          <div className="score-number" aria-label={`Score ${score} out of 100`}>
            <span className="big">{score}</span>
            <span className="of">/ 100</span>
          </div>
          <div className="meter" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${score}%` }} />
            <div className="meter-tick" style={{ left: `${score}%` }} />
          </div>
        </div>
        <div className="score-side">
          <div className="tally">
            <span>Must-have</span>
            <span className="mono">
              {breakdown.must_met} / {breakdown.must_total}
            </span>
          </div>
          <div className="tally">
            <span>Nice-to-have</span>
            <span className="mono">
              {breakdown.nice_met} / {breakdown.nice_total}
            </span>
          </div>
          <p className="muted small">
            Computed by code from the agents’ verdicts. An estimate, not a judgement on you.
          </p>
        </div>
      </section>

      <section>
        <h2 className="kicker mono">REQUIREMENTS</h2>
        <ul className="rows">
          {breakdown.per_requirement.map((req) => (
            <li key={req.requirement_id} className="row">
              <span className={`glyph ${req.verdict}`} aria-hidden="true" />
              <span className="row-text">
                {req.text}
                {!req.verified && <span className="mono muted small unverified">quote not verified</span>}
              </span>
              <span className="mono muted small">{req.kind === "must" ? "MUST" : "NICE"}</span>
              <span className="verdict">{VERDICT_LABEL[req.verdict]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="suggestions-block">
        <h2 className="kicker mono">HOW TO IMPROVE</h2>
        {suggestions.length === 0 ? (
          <p className="muted">No suggestions: nothing important is missing.</p>
        ) : (
          <ol className="suggestions">
            {suggestions.map((s, i) => {
              const related = s.requirement_id === null ? undefined : byId.get(s.requirement_id);
              return (
                <li key={i}>
                  <span className="mono num">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    {s.text}
                    {related?.text && <span className="muted small related">About: {related.text}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

export function ResultView({ result, onReset }: Props) {
  const [view, setView] = useState<"result" | "flow">("result");

  return (
    <div className="result">
      <div className="view-switch" role="group" aria-label="What to show">
        <button type="button" aria-pressed={view === "result"} onClick={() => setView("result")}>
          Result
        </button>
        <button type="button" aria-pressed={view === "flow"} onClick={() => setView("flow")}>
          How it worked
        </button>
      </div>

      {view === "flow" ? <FlowReplay /> : <Details result={result} />}

      <div className="result-actions">
        <button type="button" className="secondary" onClick={onReset}>
          New analysis
        </button>
      </div>
    </div>
  );
}
