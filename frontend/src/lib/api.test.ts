import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJob, submitAnalysis } from "./api";
import { validateCv, validateJd } from "./validation";

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("submitAnalysis", () => {
  const cv = new File(["x"], "cv.pdf", { type: "application/pdf" });

  it("posts a multipart form with the contract's field names and returns the job id", async () => {
    const fetchMock = mockFetch(json({ job_id: "abc" }, 202));
    await expect(submitAnalysis(cv, "a job")).resolves.toBe("abc");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/analyze");
    const form = init.body as FormData;
    expect(form.get("jd_text")).toBe("a job");
    expect((form.get("cv") as File).name).toBe("cv.pdf");
  });

  it("shows the server's message when there is one", async () => {
    mockFetch(json({ detail: "Not a real PDF." }, 400));
    await expect(submitAnalysis(cv, "x")).rejects.toThrow("Not a real PDF.");
  });

  it("falls back to a friendly text for a busy queue", async () => {
    mockFetch(json({}, 503));
    await expect(submitAnalysis(cv, "x")).rejects.toThrow(/busy/);
  });

  it("explains an unreachable server", async () => {
    mockFetch(new TypeError("fetch failed"));
    await expect(submitAnalysis(cv, "x")).rejects.toThrow(/Cannot reach the server/);
  });
});

describe("getJob", () => {
  it("turns a 404 into an expiry message", async () => {
    mockFetch(json({}, 404));
    const error = await getJob("gone").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });
});

describe("validation", () => {
  it("accepts pdf and docx only", () => {
    expect(validateCv(new File(["x"], "cv.PDF"))).toBeNull();
    expect(validateCv(new File(["x"], "cv.docx"))).toBeNull();
    expect(validateCv(new File(["x"], "cv.txt"))).not.toBeNull();
  });

  it("rejects an empty or too long job description", () => {
    expect(validateJd("   ")).not.toBeNull();
    expect(validateJd("a".repeat(20_001))).not.toBeNull();
    expect(validateJd("a".repeat(20_000))).toBeNull();
  });
});
