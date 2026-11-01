# Frontend

React + TypeScript + Vite. A single page with three screens: upload, processing, result.

While a job runs, the page shows the system architecture (Registry, Orchestrator, Memory,
sub-agents, Tool Gateway, services) and highlights the parts that are working, driven by the
`step` text returned by `GET /api/jobs/{id}`.

## Run it

Needs Node 20.19+ (or 22.12+).

```bash
make frontend-install   # once
make frontend-mock      # terminal 1: fake API on port 8000, no Python needed
make frontend           # terminal 2: the page on http://localhost:5173
```

With the real backend, replace the mock with `make gateway` and `make api` (see the root README).
Vite forwards `/api/*` to `http://127.0.0.1:8000`; use `VITE_API_TARGET` to point elsewhere.

The mock takes about 20 seconds per job. A job description containing the word `fail` makes the
job fail, and one containing `busy` is refused with a 503, so you can see the error screens.

## Layout

| Path | What it does |
|---|---|
| `src/lib/api.ts` | `fetch` calls and error messages, the only place that knows the URLs |
| `src/lib/useAnalysis.ts` | submit + polling state machine (`idle`, `submitting`, `running`, `done`, `error`) |
| `src/lib/stages.ts` | maps each backend `step` text to the busy boxes and to the messages travelling between them |
| `src/lib/useLoop.ts` | keeps the text log in sync with the SVG animation |
| `src/components/` | `UploadForm`, `ProcessingView`, `ArchitectureDiagram`, `ResultView` |
| `mock-server.mjs` | stand-in backend that follows `docs/api-contract.md` |

## Checks

```bash
make frontend-check   # type check, production build, unit tests
```

## Keeping it in sync with the backend

`src/types.ts` mirrors `backend/src/cvscore/schemas`, and `src/lib/stages.ts` hard-codes the
five `step` texts of `agents/orchestrator.py`. If one of those changes, update the frontend and
`stages.test.ts`. An unknown step does not break the page: it shows a generic "working" screen.
