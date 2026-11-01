import { ProcessingView } from "./components/ProcessingView";
import { ResultView } from "./components/ResultView";
import { UploadForm } from "./components/UploadForm";
import { useAnalysis } from "./lib/useAnalysis";

export default function App() {
  const { phase, startedAt, start, reset } = useAnalysis();

  return (
    <div className="shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={reset} aria-label="CV Scoring, start over">
          <span className="brand-dot" />
          CV Scoring
        </button>
        <span className="mono muted small">Agentic SOA demo</span>
      </header>

      <main>
        {(phase.kind === "idle" || phase.kind === "submitting" || phase.kind === "error") && (
          <UploadForm
            busy={phase.kind === "submitting"}
            serverError={phase.kind === "error" ? phase.message : null}
            onSubmit={start}
          />
        )}
        {phase.kind === "running" && (
          <ProcessingView status={phase.status} step={phase.step} startedAt={startedAt} />
        )}
        {phase.kind === "done" && <ResultView result={phase.result} onReset={reset} />}
      </main>
    </div>
  );
}
