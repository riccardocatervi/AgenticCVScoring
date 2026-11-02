"""Benchmark an OpenAI-compatible LLM server. Run it before choosing K, model and tool mode.

    uv run python scripts/bench_llm.py            # reads LLM_* from .env
    uv run python scripts/bench_llm.py --needle-tokens 6000 --concurrency 1 2 4 8

Prints a markdown table to paste into docs/. Only synthetic prompts: no personal data.
"""

import argparse
import asyncio
import statistics
import time

from pydantic import BaseModel

from cvscore.config import get_settings
from cvscore.llm.base import LLMClient, LLMError
from cvscore.llm.openai_client import OpenAICompatibleClient

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_cv",
            "description": "Search the candidate's CV for a word or phrase.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    }
]


class Capital(BaseModel):
    city: str
    country: str


async def timed(llm: LLMClient, *args, **kwargs):
    started = time.perf_counter()
    response = await llm.chat(*args, **kwargs)
    return response, time.perf_counter() - started


async def check_latency(llm: LLMClient, runs: int) -> dict:
    """Cold start shows in the first call; the rest give the steady state."""
    messages = [{"role": "user", "content": "Write one sentence about the sea."}]
    times, speeds = [], []
    for _ in range(runs):
        response, seconds = await timed(llm, messages, max_tokens=60)
        times.append(seconds)
        if response.usage.completion_tokens and seconds:
            speeds.append(response.usage.completion_tokens / seconds)
    return {
        "first call (s)": f"{times[0]:.2f}",
        "median later (s)": f"{statistics.median(times[1:] or times):.2f}",
        "tokens/s (median)": f"{statistics.median(speeds):.1f}" if speeds else "n/a",
    }


async def check_tools(llm: LLMClient) -> str:
    messages = [{"role": "user", "content": "Search the CV for the word Docker. Use the tool."}]
    try:
        response, _ = await timed(llm, messages, tools=TOOLS, max_tokens=100)
    except LLMError as exc:
        return f"error: {str(exc)[:60]}"
    return "yes" if response.tool_calls and response.tool_calls[0].name == "search_cv" else "NO"


async def check_structured(llm: LLMClient) -> str:
    messages = [{"role": "user", "content": "What is the capital of Italy? Answer in JSON."}]
    try:
        response, _ = await timed(llm, messages, response_schema=Capital, max_tokens=100)
        return "yes" if response.parse(Capital).city.lower() == "rome" else "valid JSON, wrong"
    except LLMError as exc:
        return f"NO ({str(exc)[:50]})"


async def check_needle(llm: LLMClient, approx_tokens: int) -> str:
    """A fact at the very start of a long prompt: if the context was cut, the answer is lost."""
    filler = "The weather report says nothing important today. " * (approx_tokens // 9)
    prompt = f"The secret code is PINEAPPLE-42. {filler}\nWhat is the secret code?"
    try:
        response, _ = await timed(llm, [{"role": "user", "content": prompt}], max_tokens=30)
    except LLMError as exc:
        return f"error: {str(exc)[:60]}"
    found = "PINEAPPLE-42" in (response.content or "")
    used = response.usage.prompt_tokens
    return f"{'found' if found else 'LOST (silent truncation?)'} (server counted {used} prompt tokens)"


async def check_concurrency(llm: LLMClient, level: int) -> dict:
    messages = [{"role": "user", "content": "Write two sentences about the sea."}]

    async def one():
        try:
            _, seconds = await timed(llm, messages, max_tokens=80)
            return seconds
        except LLMError:
            return None

    started = time.perf_counter()
    results = await asyncio.gather(*[one() for _ in range(level)])
    wall = time.perf_counter() - started
    ok = [r for r in results if r is not None]
    return {
        "parallel": level,
        "errors": level - len(ok),
        "p50 (s)": f"{statistics.median(ok):.2f}" if ok else "n/a",
        "slowest (s)": f"{max(ok):.2f}" if ok else "n/a",
        "total wall (s)": f"{wall:.2f}",
        "req/s": f"{len(ok) / wall:.2f}",
    }


def table(rows: list[dict]) -> str:
    headers = list(rows[0])
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join(str(r[h]) for h in headers) + " |" for r in rows]
    return "\n".join(lines)


async def main(args: argparse.Namespace) -> None:
    settings = get_settings()
    llm = OpenAICompatibleClient(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        timeout=settings.llm_timeout_seconds,
        max_retries=0,  # a benchmark must see the failures, not hide them
    )
    print(f"## {settings.llm_model} @ {settings.llm_base_url}\n")
    print(table([await check_latency(llm, args.runs)]), "\n")
    print(f"- tool calling: {await check_tools(llm)}")
    print(f"- structured output: {await check_structured(llm)}")
    print(f"- needle ({args.needle_tokens} tokens): {await check_needle(llm, args.needle_tokens)}\n")
    print(table([await check_concurrency(llm, n) for n in args.concurrency]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--needle-tokens", type=int, default=4000)
    parser.add_argument("--concurrency", type=int, nargs="+", default=[1, 2, 4, 8])
    asyncio.run(main(parser.parse_args()))
