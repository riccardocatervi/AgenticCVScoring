# Deploy

The whole stack runs with Docker Compose: four processes on one private network.

```
browser -> frontend (nginx, :8080) -> api (FastAPI + job queue + agents, :8000) -> gateway (MCP, :8765) -> services
                                       \-> LLM (OpenAI, Ollama on the host, or the ollama service)
```

| Service | Image | Published | Notes |
|---|---|---|---|
| `frontend` | `frontend/Dockerfile` (Node build, nginx) | `8080` | Serves the page and forwards `/api/` to `api`: one origin, no CORS. |
| `api` | `backend/Dockerfile` | `127.0.0.1:8000` | Local only: for debugging and the load test. |
| `gateway` | `backend/Dockerfile` | no | No authentication, so it never leaves the private network. |
| `ollama` | `ollama/ollama` | no | Optional, profile `ollama`, needs an NVIDIA GPU. |

`api` and `gateway` share the `cv-data` volume: the API stores each uploaded CV there and the
services read it by `cv_id`. CVs are deleted when their job ends.

## Run

```bash
cp .env.example .env     # then set the LLM block (below)
make up                  # docker compose up --build -d
make logs                # follow the logs
make down
```

Open http://localhost:8080. `GET http://localhost:8000/api/health` should answer `{"status": "ok"}`.

## Choosing the LLM backend

Every agent talks to the model through one OpenAI-compatible client, so switching backend is a
change in the LLM block of `.env` and a restart (`make up`). No code changes.

| Backend | `LLM_BASE_URL` | `LLM_API_KEY` | Start with |
|---|---|---|---|
| OpenAI (temporary) | `https://api.openai.com/v1` | the real key | `make up` |
| Ollama on the Docker host | `http://host.docker.internal:11434/v1` | any non-empty value | `make up` |
| Ollama in compose | `http://ollama:11434/v1` | any non-empty value | `make up-ollama` |

`LLM_MODEL` is the model name exactly as the server exposes it (for Ollama, the tag shown by
`ollama list`). With the compose service, pull the model once; it stays in the `ollama-models`
volume:

```bash
docker compose exec ollama ollama pull <model>
```

When Ollama runs natively on the host, make it listen on all interfaces (`OLLAMA_HOST=0.0.0.0`),
otherwise containers cannot reach it.

## Running on the local server (open-weight model, 24 GB VRAM)

The final setup replaces OpenAI with an open-weight model on a single 24 GB GPU. It is slower and
weaker, so tune these values in `.env`:

| Setting | OpenAI | Local model (starting point) | Why |
|---|---|---|---|
| `K_CONSUMERS` | 2-4 | 1-2 | Jobs in parallel. Keep it `<= OLLAMA_NUM_PARALLEL`: extra jobs only wait for the GPU and hit timeouts. |
| `OLLAMA_NUM_PARALLEL` | - | 1-2 | Requests the model serves at once. Each one needs its own context in VRAM. |
| `LLM_TIMEOUT_SECONDS` | 60 | 180 | One model call. |
| `JOB_TIMEOUT_SECONDS` | 600 | 1200 | A whole job (several agents, several calls each). |
| `MAX_AGENT_STEPS` | 10 | 10-14 | Weaker models sometimes need an extra step. |
| `MAX_QUEUE` | 100 | 20-50 | With slow jobs a long queue only means long waits: better a quick 503. |

Choosing the model: it must fit in 24 GB together with its context (a quantized instruction model,
leaving a few GB free for the KV cache) and it must support tool calling, because the
Orchestrator and the CV Matcher use tools. Compare candidates with `scripts/bench_llm.py` before
switching.

Known risks with a weaker model, owned by the agent and LLM client code:
- unreliable tool calls: the agent loop may need the "JSON action" fallback
  (`docs/architecture.md`, "Known limits");
- structured output: the client must not rely on OpenAI-only features; `response_format` and tool
  calls must also work against Ollama's `/v1` endpoint.

## Known limits

- The job queue lives in the `api` process: one `api` replica only, and jobs are lost on restart.
- The gateway has no authentication; it is protected only by not being published.
- `ollama/ollama:latest` is not pinned: pin the version used on the final server.
