from types import SimpleNamespace

import httpx
import openai
import pytest
from pydantic import BaseModel

from cvscore.llm import LLMError
from cvscore.llm.openai_client import OpenAICompatibleClient


def completion(content="hi", tool_calls=None, usage=(10, 3)):
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=message)],
        usage=SimpleNamespace(prompt_tokens=usage[0], completion_tokens=usage[1]),
    )


class FakeSDK:
    """Stands in for AsyncOpenAI: each item of `script` is returned or raised in turn."""

    def __init__(self, script):
        self.script = list(script)
        self.requests: list[dict] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **params):
        self.requests.append(params)
        item = self.script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def make(script, **kwargs):
    sdk = FakeSDK(script)
    client = OpenAICompatibleClient(
        base_url="http://x", api_key="k", model="m", backoff_base=0.0, client=sdk, **kwargs
    )
    return client, sdk


def server_error():
    request = httpx.Request("POST", "http://x")
    return openai.InternalServerError(
        "boom", response=httpx.Response(500, request=request), body=None
    )


def bad_request():
    request = httpx.Request("POST", "http://x")
    return openai.BadRequestError("nope", response=httpx.Response(400, request=request), body=None)


class Answer(BaseModel):
    value: int


async def test_plain_answer_with_usage():
    client, _ = make([completion("hello")])

    response = await client.chat([{"role": "user", "content": "hi"}])

    assert response.content == "hello"
    assert (response.usage.prompt_tokens, response.usage.completion_tokens) == (10, 3)
    assert response.latency_s >= 0


async def test_tool_calls_are_translated():
    call = SimpleNamespace(
        id="c1", function=SimpleNamespace(name="search_cv", arguments='{"query": "x"}')
    )
    client, _ = make([completion(None, [call])])

    response = await client.chat([], tools=[{"type": "function"}])

    assert [(c.id, c.name, c.arguments) for c in response.tool_calls] == [
        ("c1", "search_cv", '{"query": "x"}')
    ]


async def test_schema_is_sent_as_json_schema_response_format():
    client, sdk = make([completion('{"value": 1}')])

    await client.chat([], response_schema=Answer)

    sent = sdk.requests[0]["response_format"]
    assert sent["type"] == "json_schema"
    assert sent["json_schema"]["name"] == "Answer"
    assert "value" in sent["json_schema"]["schema"]["properties"]


async def test_server_errors_are_retried_then_succeed():
    client, sdk = make([server_error(), server_error(), completion("ok")])

    response = await client.chat([])

    assert response.content == "ok"
    assert len(sdk.requests) == 3


async def test_gives_up_after_max_retries():
    client, sdk = make([server_error()] * 3, max_retries=2)

    with pytest.raises(LLMError, match="3 attempts"):
        await client.chat([])

    assert len(sdk.requests) == 3


async def test_client_errors_are_not_retried():
    client, sdk = make([bad_request(), completion("never")])

    with pytest.raises(LLMError, match="rejected"):
        await client.chat([])

    assert len(sdk.requests) == 1


async def test_empty_choices_is_an_error():
    client, _ = make([SimpleNamespace(choices=[], usage=None)])

    with pytest.raises(LLMError, match="no choices"):
        await client.chat([])


def refusal(message):
    request = httpx.Request("POST", "http://x")
    return openai.BadRequestError(message, response=httpx.Response(400, request=request), body=None)


async def test_max_tokens_is_swapped_when_the_server_wants_max_completion_tokens():
    unsupported = "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."
    client, sdk = make([refusal(unsupported), completion("ok")])

    response = await client.chat([], max_tokens=100)

    assert response.content == "ok"
    assert "max_tokens" in sdk.requests[0]
    assert sdk.requests[1]["max_completion_tokens"] == 100
    assert "max_tokens" not in sdk.requests[1]


async def test_a_refused_temperature_is_dropped():
    unsupported = "Unsupported value: 'temperature' does not support 0 with this model."
    client, sdk = make([refusal(unsupported), completion("ok")])

    await client.chat([])

    assert "temperature" not in sdk.requests[1]


async def test_the_lesson_is_remembered_for_the_next_calls():
    unsupported = "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."
    client, sdk = make([refusal(unsupported), completion("a"), completion("b")])

    await client.chat([], max_tokens=50)
    await client.chat([], max_tokens=60)

    assert len(sdk.requests) == 3  # the second call needed no failed attempt first
    assert sdk.requests[2]["max_completion_tokens"] == 60


async def test_an_unrelated_bad_request_is_still_an_error():
    client, sdk = make([refusal("invalid image"), completion("never")])

    with pytest.raises(LLMError, match="rejected"):
        await client.chat([])

    assert len(sdk.requests) == 1


async def test_reasoning_effort_none_is_added_when_tools_need_it():
    needs = (
        "Function tools with reasoning_effort are not supported. Set reasoning_effort to 'none'."
    )
    client, sdk = make([refusal(needs), completion("ok"), completion("again")])

    await client.chat([], tools=[{"type": "function"}])
    await client.chat([])

    assert "reasoning_effort" not in sdk.requests[0]
    assert sdk.requests[1]["reasoning_effort"] == "none"
    assert sdk.requests[2]["reasoning_effort"] == "none"  # remembered


async def test_several_refusals_in_a_row_are_all_fixed():
    first = "Unsupported parameter: 'max_tokens'. Use 'max_completion_tokens' instead."
    second = "Set reasoning_effort to 'none' to use function tools."
    client, sdk = make([refusal(first), refusal(second), completion("ok")])

    response = await client.chat([], max_tokens=10)

    assert response.content == "ok"
    assert sdk.requests[2]["max_completion_tokens"] == 10
    assert sdk.requests[2]["reasoning_effort"] == "none"
