.PHONY: install check test gateway api frontend-install frontend frontend-mock frontend-check

install:
	cd backend && uv sync

check:
	cd backend && uv run ruff check && uv run ruff format --check

test:
	cd backend && uv run pytest

gateway:
	cd backend && uv run python -m cvscore.mcp_server

api:
	cd backend && uv run uvicorn cvscore.api.app:app_factory --factory --port 8000

frontend-install:
	cd frontend && npm install

frontend:
	cd frontend && npm run dev

frontend-mock:
	cd frontend && npm run mock

frontend-check:
	cd frontend && npm run build && npm test
