"""HTTP API: upload a CV and a job description, poll for the result.

The frontend already exists, so the exact paths and fields come from docs/api-contract.md.
Until that document says otherwise, this is the shape we assume.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from cvscore.config import get_settings
from cvscore.jobs import JobManager, QueueFull, make_runner
from cvscore.logging_setup import setup_logging
from cvscore.schemas import JobState
from cvscore.storage import MAX_UPLOAD_BYTES, StorageError, delete_cv, save_cv

log = logging.getLogger("cvscore.api")

MAX_JD_CHARS = 20_000


class AnalyzeAccepted(BaseModel):
    job_id: str


def build_manager() -> JobManager:
    """Real wiring: settings -> OpenAICompatibleClient -> make_runner -> JobManager."""
    # Imported here: the module needs the `openai` package, which tests of the API do not.
    from cvscore.llm.openai_client import OpenAICompatibleClient

    settings = get_settings()
    llm = OpenAICompatibleClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        timeout=settings.llm_timeout_seconds,
    )
    runner = make_runner(
        llm, gateway_url=settings.mcp_gateway_url, max_steps=settings.max_agent_steps
    )
    return JobManager(
        runner,
        k_consumers=settings.k_consumers,
        max_queue=settings.max_queue,
        job_timeout=settings.job_timeout_seconds,
        ttl_seconds=settings.job_ttl_seconds,
        storage_dir=settings.storage_dir,
    )


def create_app(manager: JobManager | None = None) -> FastAPI:
    """Build the FastAPI app. Pass a manager in tests, leave None in production.

    Routes read the manager from app.state, so a test can set it without running the lifespan.
    Never log the CV or JD content.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        setup_logging()
        if getattr(app.state, "manager", None) is None:
            app.state.manager = build_manager()
        app.state.manager.start()
        try:
            yield
        finally:
            await app.state.manager.stop()

    app = FastAPI(title="CV scoring", lifespan=lifespan)
    if manager is not None:
        app.state.manager = manager

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/analyze", status_code=202)
    async def analyze(
        request: Request,
        cv: Annotated[UploadFile, File()],
        jd_text: Annotated[str, Form()],
    ) -> AnalyzeAccepted:
        # Check the JD first, so nothing is stored for a request we reject anyway.
        if not jd_text.strip():
            raise HTTPException(422, "The job description is empty.")
        if len(jd_text) > MAX_JD_CHARS:
            raise HTTPException(
                413, f"The job description is longer than {MAX_JD_CHARS} characters."
            )

        data = await cv.read(MAX_UPLOAD_BYTES + 1)  # one byte more is enough to say "too big"
        try:
            cv_id = await asyncio.to_thread(save_cv, data, cv.filename or "")
        except StorageError as exc:
            raise HTTPException(400, f"The CV was rejected: {exc}.") from None

        manager: JobManager = request.app.state.manager
        try:
            job_id = manager.submit(cv_id, jd_text)
        except QueueFull:
            delete_cv(cv_id)
            raise HTTPException(503, "The service is busy, please try again later.") from None
        log.info("accepted job=%s", job_id)
        return AnalyzeAccepted(job_id=job_id)

    @app.get("/api/jobs/{job_id}")
    async def get_job(request: Request, job_id: str) -> JobState:
        state = request.app.state.manager.get(job_id)
        if state is None:
            raise HTTPException(404, "Unknown or expired job.")
        return state

    return app


def app_factory() -> FastAPI:
    """Entry point for uvicorn: `uvicorn cvscore.api.app:app_factory --factory`."""
    return create_app()
