# Agentic-SOA-CV-Scoring

Upload a CV (PDF or DOCX) and paste a job description. A small team of LLM agents scores how well
the CV fits the job, requirement by requirement, quotes the evidence it found in the CV, and
suggests how to improve it.

This is a university project for the course *Service Design and Engineering* (UniTN), on
**Agentic Service-Oriented Architecture**: services with a clear contract, some of which are
implemented by agents with limited autonomy, composed behind one tool gateway.

- [What you get](#what-you-get)
- [How it works](#how-it-works)
- [Repository layout](#repository-layout)
- [Run it](#run-it)
- [Configuration](#configuration)
- [Choosing the LLM backend](#choosing-the-llm-backend)
- [Using the app](#using-the-app)
- [HTTP API](#http-api)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Status and what is left](#status-and-what-is-left)
- [Known limits](#known-limits)
- [Privacy and security](#privacy-and-security)

## What you get

For one CV and one job description:

- a **score from 0 to 100**, computed by code and explained requirement by requirement;
- for every requirement of the job, a verdict (`yes`, `partial`, `no`), whether it is a
  *must-have* or a *nice-to-have*, and whether the quote that backs it was verified in the CV;
- up to a few **suggestions**, written to stay honest: "if you used X in a project, say so",
  never "add X" when X is not in the CV;
- an animated view of the architecture while the job runs, and the same view again afterwards
  (**How it worked**), so you can see what each part did.

The score is a heuristic assisted by a language model. It is an estimate, not a judgement on
the person.

## How it works

```
                         Registry ── Orchestrator ── Memory
                                         │
               ┌─────────────────────────┼─────────────────────────┐
          JD Analyst                CV Matcher                 Evaluator          agents (LLM)
               │                         │                         │
               └──────────────── Tool Gateway (MCP server, HTTP) ──┘
                          │                │                │
                     CV service      Verify service    Scoring service          deterministic code
```

| Part | Kind | What it does |
|---|---|---|
| **Orchestrator** | LLM agent | Goal, plan, act, observe. Delegates work to the sub-agents, looks at the result, and repeats only what failed. Never calls a service directly. Has a hard step limit. |
| **Registry** | catalog | The sub-agents, what each may do, and which tools each is allowed to use (`agents/registry.py`). |
| **Memory** | per-job state | Requirements, matches, verification results and score of one job. It dies with the job and is never shared between users. |
| **JD Analyst** | LLM, no tools | Turns the job description (untrusted text) into a fixed list of requirements. Having no tools confines any prompt injection hidden in the text. |
| **CV Matcher** | LLM with a loop | Decides which searches to run in the CV and when it has enough evidence. Answers each requirement with a verdict and a quote. |
| **Evaluator** | code + LLM | Verifies every quote against the CV, computes the score, and only then asks the LLM to write the suggestions. |
| **Tool Gateway** | MCP server | The single door to the services: `parse_cv`, `get_section`, `search_cv`, `verify_evidence`, `compute_score`. Speaks MCP over Streamable HTTP. |
| **CV, Verify and Scoring services** | deterministic | Parse and search the CV, check that a quote really exists, apply the scoring formula. No LLM inside. |

### One job, step by step

1. The **JD Analyst** turns the job description into requirements, each `must` or `nice`.
2. The **CV Matcher** searches the CV through the gateway and answers each requirement with
   `yes`, `partial` or `no` plus a literal quote from the CV. A `no` needs no quote.
3. The **Evaluator** checks every quote against the CV text. A quote that is not found counts
   as nothing.
4. If some checks failed, the Orchestrator sends **only those requirements** back to the
   Matcher, a limited number of times.
5. The Evaluator computes the score and writes the suggestions.
6. The Orchestrator ends the job and the API returns the result.

### Design rules that matter

- **The score is computed by code, never by the LLM.** `must` weighs 3, `nice` weighs 1;
  `yes` counts 1, `partial` 0.5, `no` 0; an unverified quote counts 0.
  `score = round(100 × Σ(weight × outcome) / Σ(weight))`.
- **Every quote must exist in the CV.** This is the defence against invented evidence.
- **Agents have the least privilege.** The JD Analyst has no tools, the Matcher can only read
  the CV, the Evaluator can only verify and score.
- **The job description and the CV are untrusted input.** They are passed as delimited data in
  the user message, never in a system prompt.
- **Files travel by id.** The CV text never goes through the Orchestrator's context.
- **Every agent loop has a step limit**, and on the last step the tools are taken away.
- **Every LLM output is validated** against a Pydantic schema. No parsing of free text.
- **Prompts are `.md` files** in `backend/src/cvscore/agents/prompts/`.

More detail and the reasons behind these choices: [docs/architecture.md](docs/architecture.md).

## Repository layout

```
backend/
  src/cvscore/
    api/            FastAPI app: upload, job status, health
    jobs/           in-process queue with K consumers, job timeout, TTL
    agents/         agent loop, Orchestrator, JD Analyst, CV Matcher, Evaluator, registry, memory
      prompts/      one .md file per prompt
    mcp_client/     how the agents reach the gateway (a toolbox per agent)
    mcp_server/     the Tool Gateway (server.py) and the services (services/)
    llm/            LLMClient interface, OpenAI-compatible client, scripted fake for tests
    schemas/        shared contracts (Pydantic)
    config.py       settings read from .env
    storage.py      uploaded CVs, saved by id
  tests/            pytest, including an end-to-end test with a scripted model
frontend/           React + TypeScript (Vite), with a mock API for working without the backend
docs/               architecture, API contract, deploy guide
scripts/            bench_llm.py: benchmark of an LLM server
docker-compose.yml  the whole stack in four containers
Makefile            shortcuts for everything below
```

The dependency rule is strict and enforced by review:

```
api -> jobs -> agents -> mcp_client -> (HTTP) -> mcp_server -> services
```

`services/` never imports from `agents`, `api`, `jobs` or `llm`, so each service could live on
its own. Agents never import a service directly: they always go through the gateway.

## Run it

Three ways, from the easiest to the most flexible. All of them need a **`.env` file**, so start
there.

### 0. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and set at least the three LLM values: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`
(see [Choosing the LLM backend](#choosing-the-llm-backend)). `.env` holds your key and is ignored
by git: **never commit it**.

### A. With Docker (the whole stack)

Needs Docker with the Compose plugin.

```bash
make up        # docker compose up --build -d
make logs      # follow the logs
make down      # stop everything
```

Open http://localhost:8080. `GET http://localhost:8000/api/health` should answer
`{"status": "ok"}`.

Four containers on one private network: `frontend` (nginx, the only public port, `8080`),
`api` (FastAPI, queue and agents, published only on `127.0.0.1:8000`), `gateway` (MCP, never
published, because it has no authentication) and, optionally, `ollama`. How to point it at
OpenAI, at Ollama on your machine or at Ollama in a container: [docs/deploy.md](docs/deploy.md).

### B. On your machine, without Docker

Needs [uv](https://docs.astral.sh/uv/) (it installs Python 3.12 for you) and Node.js.

```bash
make install            # backend dependencies (uv sync)
make frontend-install   # frontend dependencies (npm install)
```

Then three terminals, **in this order**, all from the repository root:

```bash
make gateway     # 1. the Tool Gateway, on http://127.0.0.1:8765/mcp
make api         # 2. the API with the queue and the agents, on http://127.0.0.1:8000
make frontend    # 3. the page, on http://localhost:5173
```

Open http://localhost:5173. The Vite dev server forwards `/api` to port 8000, so the browser
sees a single origin and there is no CORS to configure. If the API runs elsewhere, set
`VITE_API_TARGET` before `make frontend`.

After you change `.env` or any backend code, restart `make gateway` and `make api`: they do not
reload by themselves. A change to a schema used by the scoring service needs **both** restarted.

Run one job from the command line, without the web page (the gateway must be running):

```bash
cd backend && uv run python -m cvscore.agents path/to/cv.pdf path/to/job_description.txt
```

### C. Frontend only, with a fake backend

To work on the page without a model, a key or the backend:

```bash
make frontend-mock    # a fake API on port 8000: 3 s in the queue, then 5 steps of 6 s each
make frontend         # in another terminal
```

The mock answers with a fixed result, whatever you upload. **Do not run it together with
`make api`**: they both want port 8000.

## Configuration

Everything is read from `.env` (in the repository root, or in the folder you start from).

| Variable | Default | Meaning |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | Any OpenAI-compatible endpoint. |
| `LLM_API_KEY` | none, required | The key. For a local Ollama any non-empty value works. |
| `LLM_MODEL` | none, required | The model name exactly as the server exposes it. |
| `LLM_TIMEOUT_SECONDS` | `60` | Maximum time of one model call. |
| `K_CONSUMERS` | `2` | Jobs processed in parallel. |
| `MAX_AGENT_STEPS` | `10` | Hard cap on steps of one agent loop. |
| `MAX_QUEUE` | `100` | Jobs allowed to wait; beyond this the API answers `503`. |
| `JOB_TIMEOUT_SECONDS` | `600` | A running job is stopped and marked as failed after this. |
| `JOB_TTL_SECONDS` | `3600` | Finished jobs and uploaded CVs are deleted after this. |
| `REUSE_RESULTS` | `true` | The same CV file and job description get the same answer: the earlier job is returned. Set to `false` to run the model again every time. |
| `STORAGE_DIR` | `data` | Where uploaded CVs are kept while a job runs. |
| `MCP_GATEWAY_URL` | `http://127.0.0.1:8765/mcp` | Where the gateway listens, and where the API finds it. |
| `OLLAMA_NUM_PARALLEL`, `OLLAMA_KEEP_ALIVE` | `1`, `30m` | Only for the Ollama container of `make up-ollama`. |

## Choosing the LLM backend

All agents talk to the model through one OpenAI-compatible client
(`backend/src/cvscore/llm/openai_client.py`), and nothing else imports the `openai` package.
Changing backend is a change of three values in `.env` and a restart. No code changes.

| Backend | `LLM_BASE_URL` | `LLM_API_KEY` | `LLM_MODEL` |
|---|---|---|---|
| OpenAI | `https://api.openai.com/v1` | your key | a model your project may use |
| Ollama on your machine | `http://localhost:11434/v1` | any non-empty value | a tag from `ollama list` |
| Ollama on the host, from Docker | `http://host.docker.internal:11434/v1` | any non-empty value | a tag from `ollama list` |
| Ollama in the compose stack | `http://ollama:11434/v1` | any non-empty value | the tag you pulled |
| The FBK server (final setup) | the address we are given | the key we are given | the model it exposes |

Requirements for the model:

- **Tool calling.** The Orchestrator and the CV Matcher use tools. A model without it will not
  work.
- **Structured output.** The agents ask for JSON that must match a schema.
- **Enough context.** Ollama's default context is small and it can silently cut a long prompt.
  Check this with the benchmark below before trusting a model.

The client adapts to what the server accepts. It first sends `max_tokens`; if a server answers
with a 400 that names `max_completion_tokens`, `temperature` or `reasoning_effort`, it fixes the
request, remembers it and retries. This is how the same code works with OpenAI's newer models
and with Ollama. It is covered by tests with fake servers, but it has **not been run against a
real Ollama yet** (see [Status](#status-and-what-is-left)).

Before choosing the model, K and the tool-calling mode on a real server, run the benchmark. It
measures latency, tokens per second, cold start, tool calling, structured output, a long-context
"needle in a haystack" test and the behaviour at 1, 2, 4 and 8 parallel requests, with
synthetic prompts only:

```bash
cd backend && uv run python ../scripts/bench_llm.py
```

A local open-weight model is slower and weaker than a hosted one. Suggested starting values for
a 24 GB GPU are in [docs/deploy.md](docs/deploy.md).

## Using the app

1. Choose a **PDF or DOCX** CV, up to 5 MB. The server checks the file content, not only the
   extension. A scanned PDF without a text layer cannot be read.
2. Paste the **job description**, up to 20,000 characters, and press **Analyze**.
3. While you wait you see the architecture, with the active parts lit and messages moving between
   them, plus a text log of the same messages and a list of the five steps. If many people use
   the system at once your job waits in a queue first.
4. When it ends you get the score, the requirements with their verdicts, and the suggestions.
   Switch to **How it worked** to see the architecture again. Nothing plays by itself: drag the
   bar, use the arrow buttons or the keyboard arrows to move through the 25 messages one at a
   time, or click a step on the left to jump to it. It shows the path every analysis follows, not
   a recording of your job.
5. **New analysis**, next to the two views, starts over. Your CV is deleted from the server when
   the job ends.

**The same input gives the same score.** A language model can answer differently each time, so
sending the same CV file with the same job description again returns the earlier job instead of
running the agents once more (the comparison ignores extra spaces in the job description, but
not a re-saved file: different bytes count as a different CV). A job that failed is never
reused. The earlier job is kept for `JOB_TTL_SECONDS`, then forgotten. Set
`REUSE_RESULTS=false` when you want independent runs, for example to measure variation.

The five steps the page knows about are the `step` texts the backend reports. They are listed in
[docs/api-contract.md](docs/api-contract.md); changing one means changing
`frontend/src/lib/stages.ts` too. An unknown text does not break the page: it shows a generic
"working" stage.

## HTTP API

| Method and path | What it does |
|---|---|
| `GET /api/health` | `200 {"status": "ok"}`. |
| `POST /api/analyze` | `multipart/form-data` with `cv` (file) and `jd_text` (text). `202 {"job_id": "…"}`. |
| `GET /api/jobs/{job_id}` | Poll until `status` is `done` or `failed`. |

Errors are `{"detail": "<message safe to show>"}`: `400` bad CV, `413` job description too long,
`422` missing field, `503` queue full, `404` unknown or expired job. Full request and response
shapes: [docs/api-contract.md](docs/api-contract.md).

```bash
curl -F cv=@my_cv.pdf -F jd_text="$(cat job.txt)" http://localhost:8000/api/analyze
curl http://localhost:8000/api/jobs/<job_id>
```

## Development

```bash
make check             # ruff lint and format check (backend)
make test              # pytest (backend)
make frontend-check    # type check, build and tests (frontend)
```

- The whole stack is tested without a real model: `backend/tests/test_system.py` runs the API,
  the queue, the agents, the gateway and the services with a **scripted fake model**.
- Keep `ruff` clean and add a test for every change.
- Branches, commits, naming, who owns what and the dependency rule are in
  [CONTRIBUTING.md](CONTRIBUTING.md). In short: never commit to `main` or `dev`; one branch per
  piece of work, merged into `dev` by a reviewed pull request; commits are
  `type(scope): what`, in English.
- `schemas/` and `docs/api-contract.md` are shared contracts: change them only with the agreement
  of the whole team.

## Troubleshooting

**The page says "A required service is not available" and nothing else.** That message hides the
real cause on purpose. Look at the terminal of `make api`: the failure is logged with the
`job=<id>`. Typical causes:

| In the API log | Cause and fix |
|---|---|
| connection refused to `127.0.0.1:8765` | The gateway is not running. Start `make gateway`. |
| 401 or 403 from the model | Wrong key, or the key's project has no access to that model. |
| 404 model not found | `LLM_MODEL` does not match what the server exposes. |
| 400 naming a parameter | The client normally fixes these itself. If one is not fixed, open an issue with the message. |
| timeout | Raise `LLM_TIMEOUT_SECONDS` and `JOB_TIMEOUT_SECONDS`, especially with a local model. |

**I changed something and nothing happened.** Restart `make gateway` and `make api`. Only the
frontend reloads by itself.

**`.env` is ignored, or a value looks wrong.** Check that each line is `NAME=value` exactly once
(a doubled `LLM_BASE_URL=LLM_BASE_URL=…` is easy to produce). The file is read from the folder you
start from or its parent.

**Port already in use.** The ports are 8765 (gateway), 8000 (API), 5173 (page in development) and
8080 (page in Docker). `lsof -nP -iTCP:8000 -sTCP:LISTEN` shows who holds one. Do not run
`make frontend-mock` and `make api` together.

**A job is stuck in the queue.** `K_CONSUMERS` jobs run at the same time; the others wait. With a
local model keep `K_CONSUMERS` at or below `OLLAMA_NUM_PARALLEL`.

**The result looks wrong with a small model.** Small models are often weak at tool calling. Run
the benchmark and look at the tool-calling and structured-output rows before blaming the code.

## Status and what is left

Done: every part of the architecture, the API and queue, the React frontend with the animated
architecture, the Docker setup, and the tests. A full job has been run end to end with a real
model (OpenAI), through the web page, using a real CV.

Still to do, in order of importance:

1. **Run against a real Ollama**, locally and then on the FBK server, and fix what breaks. This is
   the biggest unknown: tool calling and structured output depend on the model and the Ollama
   version.
2. **Run `scripts/bench_llm.py` on the FBK server** and use the numbers to choose the model, `K`,
   the tool-calling mode and the timeouts. Write the table in `docs/`.
3. **Load test** with about 40 simultaneous users (Locust, in `loadtest/`, not written yet),
   including the worst case where every job hits its step limit.
4. **Evaluation** (`evals/`, empty for now): a few CV and job description pairs, the same pair
   repeated to measure how much the score varies, CVs of different quality against the same job,
   and prompt-injection tests with hidden instructions in the job description and in the CV.
5. **Check the Docker stack on a clean machine** after the latest dependency changes.
6. **Open questions for the group and the professors**: whether "score and suggestions" is an
   acceptable deliverable instead of a rewritten CV; what the course expects from an *Agentic SOA*
   (registry and discovery, communication between agents); whether the must-have requirements
   should act as a gate on the score; whether the demo with 40 users can be staggered.

## Known limits

- The job queue lives in the API process: **one API replica only**, and jobs are lost when it
  restarts.
- The gateway has no authentication. It is protected only by not being published.
- Quote verification is fuzzy (similarity threshold 0.85, so a typo passes), but every number in
  the quote must also appear where it matched: an invented "90%" is rejected. Other invented
  details, like a changed company name, can still pass if the rest of the sentence matches.
- A different file with the same content (re-saved, re-exported) is a different CV for the reuse
  of results, so it can get a different score.
- The upload check looks at the file's first bytes, not at the whole structure of the file.
- With a weak model the agents may need a "JSON action" fallback instead of native tool calling.
  It is not implemented; it will be only if the benchmark says it is needed.
- Capacity numbers are estimates until the load test runs on the real server.

## Privacy and security

A CV is personal data.

- Logs carry ids, step names and counters, **never the text of a CV or a job description**.
- Uploaded CVs are deleted when their job ends; finished jobs are forgotten after
  `JOB_TTL_SECONDS`.
- Each job has its own memory. The only thing shared is the answer to an identical request:
  whoever sends the very same CV file and job description gets the earlier job.
- The job description and the CV are treated as untrusted input (see
  [Design rules](#design-rules-that-matter)).
- Using the FBK server keeps the data inside the university's infrastructure. Using OpenAI sends
  the CV and the job description to that provider: use synthetic or your own data for tests.
- Keys live only in `.env`, which git ignores. If a key leaks, revoke it and create a new one.
