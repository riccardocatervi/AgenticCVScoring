# Agentic-SOA-CV-Scoring
Score a CV against a job description, with a small team of LLM agents that reach the
deterministic services through an MCP tool gateway. See `docs/architecture.md`,
`CONTRIBUTING.md` and `.env.example`.

## Run with Docker

`cp .env.example .env`, set the LLM values, then `make up` and open http://localhost:8080.
How to switch between OpenAI and a local Ollama model: `docs/deploy.md`.
