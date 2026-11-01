import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { MAX_JD_CHARS, formatSize, validateCv, validateJd } from "../lib/validation";

interface Props {
  busy: boolean;
  serverError: string | null;
  onSubmit: (cv: File, jdText: string) => void;
}

export function UploadForm({ busy, serverError, onSubmit }: Props) {
  const [cv, setCv] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = validateCv(file);
    setCvError(problem);
    setCv(problem ? null : file);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const jdProblem = validateJd(jd);
    const cvProblem = cv ? null : (cvError ?? "Choose your CV first.");
    setJdError(jdProblem);
    setCvError(cvProblem);
    if (cv && !jdProblem && !cvProblem) onSubmit(cv, jd);
  }

  return (
    <form className="upload" onSubmit={submit} noValidate>
      <div className="hero">
        <h1>Score your CV against a job.</h1>
        <p>
          Several AI agents check your CV against each requirement of the job description, and
          quote the proof.
        </p>
      </div>

      <div className="inputs">
        <div className="field">
          <label htmlFor="cv-input" className="kicker mono">
            01 · YOUR CV
          </label>
          <div
            className={`dropzone${dragging ? " dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={input}
              id="cv-input"
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="visually-hidden"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {cv ? (
              <div className="file-chip">
                <span className="file-name">{cv.name}</span>
                <span className="mono muted small">{formatSize(cv.size)}</span>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setCv(null);
                    if (input.current) input.current.value = "";
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <label htmlFor="cv-input" className="drop-prompt">
                <span className="drop-icon">
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5" />
                    <path d="M6 11l6-6 6 6" />
                  </svg>
                </span>
                <span className="drop-title">
                  Drop your CV or <span className="browse">browse</span>
                </span>
                <span className="mono muted small">PDF or DOCX · max 5 MB</span>
              </label>
            )}
          </div>
          {cvError && (
            <p className="error" role="alert">
              {cvError}
            </p>
          )}
        </div>

        <div className="field wide">
          <div className="label-row">
            <label htmlFor="jd" className="kicker mono">
              02 · JOB DESCRIPTION
            </label>
            <span className={`kicker mono${jd.length > MAX_JD_CHARS ? " over" : ""}`}>
              {jd.length.toLocaleString("en-US")} / {MAX_JD_CHARS.toLocaleString("en-US")}
            </span>
          </div>
          <textarea
            id="jd"
            value={jd}
            placeholder="Paste the job description here"
            onChange={(e) => setJd(e.target.value)}
          />
          {jdError && (
            <p className="error" role="alert">
              {jdError}
            </p>
          )}
        </div>
      </div>

      {serverError && (
        <p className="error banner" role="alert">
          {serverError}
        </p>
      )}

      <div className="actions">
        <span className="mono muted small">Your CV is deleted from the server when the analysis ends.</span>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Sending" : "Analyze"}
          <span className="btn-dot" />
        </button>
      </div>
    </form>
  );
}
