// A tiny stand-in for the real backend, to work on the UI without Python, Ollama or the gateway.
// It follows docs/api-contract.md: POST /api/analyze, GET /api/jobs/{id}, GET /api/health.
//
//   npm run mock          (listens on port 8000, where the Vite proxy points)
//
// A job walks through the same five `step` texts the real orchestrator sends.
// Try the error paths: a job description containing "fail" makes the job fail,
// and one containing "busy" is refused with 503.

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 8000);
const STEP_SECONDS = 6;
const STEPS = [
  "Analyzing the job description",
  "Searching the CV for evidence",
  "Verifying the quotes against the CV",
  "Computing the score",
  "Writing suggestions",
];
const QUEUE_SECONDS = 3;

const RESULT = {
  score: 72,
  breakdown: {
    score: 72,
    must_met: 4,
    must_total: 6,
    nice_met: 1,
    nice_total: 2,
    per_requirement: [
      { requirement_id: 1, kind: "must", verdict: "yes", verified: true, weight: 3, outcome: 1, points: 3 },
      { requirement_id: 2, kind: "must", verdict: "partial", verified: true, weight: 3, outcome: 0.5, points: 1.5 },
      { requirement_id: 3, kind: "must", verdict: "no", verified: true, weight: 3, outcome: 0, points: 0 },
      { requirement_id: 4, kind: "nice", verdict: "yes", verified: true, weight: 1, outcome: 1, points: 1 },
    ],
  },
  suggestions: [
    { requirement_id: 2, text: "If you used Docker in one of your projects, say so and name the project." },
    { requirement_id: 3, text: "If you have worked with Kubernetes, mention where and how." },
  ],
};

/** id -> { startedAt, fails } */
const jobs = new Map();

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("latin1")));
  });
}

function jobState(id, job) {
  const seconds = (Date.now() - job.startedAt) / 1000;
  if (seconds < QUEUE_SECONDS) return { id, status: "queued", step: null, result: null, error: null };
  const index = Math.floor((seconds - QUEUE_SECONDS) / STEP_SECONDS);
  if (index < STEPS.length) {
    if (job.fails && index >= 2) {
      return { id, status: "failed", step: null, result: null, error: "The model did not answer in time. Please try again." };
    }
    return { id, status: "processing", step: STEPS[index], result: null, error: null };
  }
  return { id, status: "done", step: null, result: RESULT, error: null };
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { status: "ok" });

  if (req.method === "POST" && url.pathname === "/api/analyze") {
    const body = await readBody(req);
    if (body.includes("busy")) return send(res, 503, { detail: "The queue is full. Try again later." });
    if (!body.includes('name="cv"')) return send(res, 422, { detail: "Missing CV." });
    const id = randomUUID().replaceAll("-", "");
    jobs.set(id, { startedAt: Date.now(), fails: body.includes("fail") });
    return send(res, 202, { job_id: id });
  }

  const match = url.pathname.match(/^\/api\/jobs\/([\w-]+)$/);
  if (req.method === "GET" && match) {
    const id = match[1];
    const job = jobs.get(id);
    return job ? send(res, 200, jobState(id, job)) : send(res, 404, { detail: "Unknown job." });
  }

  send(res, 404, { detail: "Not found." });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Mock API on http://127.0.0.1:${PORT}  (a job takes about ${QUEUE_SECONDS + STEPS.length * STEP_SECONDS}s)`);
});
