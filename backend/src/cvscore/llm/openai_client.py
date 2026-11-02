"""LLMClient for any OpenAI-compatible server: Ollama (default), OpenAI, FBK's gateway.

This is the only module that imports `openai`. Retries and timeouts live here so the agents
never have to think about them.
"""

import asyncio
import logging
import random
import time
from typing import Any

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel

from cvscore.llm.base import LLMError, LLMResponse, Message, ToolCall, Usage

log = logging.getLogger("cvscore.llm")

# Worth retrying: the server is busy or the network blinked. Anything else is our bug.
_RETRYABLE = (
    openai.RateLimitError,
    openai.APITimeoutError,
    openai.APIConnectionError,
    openai.InternalServerError,
)


class OpenAICompatibleClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float = 60.0,
        max_retries: int = 3,
        backoff_base: float = 1.0,
        client: AsyncOpenAI | None = None,
    ):
        self._model = model
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        # max_retries=0: the SDK would retry silently, we want to see and count every retry.
        self._client = client or AsyncOpenAI(
            base_url=base_url, api_key=api_key, timeout=timeout, max_retries=0
        )

    async def chat(
        self,
        messages: list[Message],
        tools: list[dict[str, Any]] | None = None,
        response_schema: type[BaseModel] | None = None,
        max_tokens: int = 512,
    ) -> LLMResponse:
        params: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0,
        }
        if tools:
            params["tools"] = tools
        if response_schema is not None:
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": response_schema.__name__,
                    "schema": response_schema.model_json_schema(),
                },
            }

        started = time.perf_counter()
        completion = await self._create_with_retry(params)
        latency = time.perf_counter() - started

        if not completion.choices:
            raise LLMError("the server returned no choices")
        message = completion.choices[0].message
        usage = completion.usage
        return LLMResponse(
            content=message.content,
            tool_calls=[
                ToolCall(id=call.id, name=call.function.name, arguments=call.function.arguments)
                for call in (message.tool_calls or [])
            ],
            usage=Usage(
                prompt_tokens=usage.prompt_tokens if usage else 0,
                completion_tokens=usage.completion_tokens if usage else 0,
            ),
            latency_s=latency,
        )

    async def _create_with_retry(self, params: dict[str, Any]):
        for attempt in range(self._max_retries + 1):
            try:
                return await self._client.chat.completions.create(**params)
            except _RETRYABLE as exc:
                if attempt == self._max_retries:
                    raise LLMError(
                        f"model call failed after {attempt + 1} attempts: {exc}"
                    ) from exc
                delay = self._backoff_base * 2**attempt * random.uniform(0.5, 1.5)
                log.warning(
                    "llm retry attempt=%d reason=%s wait=%.1fs",
                    attempt + 1,
                    type(exc).__name__,
                    delay,
                )
                await asyncio.sleep(delay)
            except openai.OpenAIError as exc:
                raise LLMError(f"model call rejected: {exc}") from exc
        raise AssertionError("unreachable")
