# API contract

**Status: draft.** This is what the backend exposes today. The existing frontend is an external
constraint we cannot change, so every endpoint, field and error format below must be checked
against the frontend code before this document is approved by all three of us.

Open points to check in the frontend:
- paths and HTTP methods
- names of the form fields and of the JSON fields
- how errors are shown (status codes, message format)
- how it displays waiting (polling interval, what it does with `step`)
- how it renders the result and the suggestions

## Endpoints

### `GET /api/health`

`200 {"status": "ok"}`

### `POST /api/analyze`

Starts an analysis. `multipart/form-data` with two fields:

| Field | Type | Notes |
|---|---|---|
| `cv` | file | `.pdf` or `.docx`, up to 5 MB, content checked (not only the extension) |
| `jd_text` | text | the job description, up to 20,000 characters |

Responses:

| Status | Meaning |
|---|---|
| `202` | accepted, body `{"job_id": "<id>"}` |
| `400` | the CV is rejected (wrong type, empty, too big, corrupted header) |
| `413` | the job description is too long |
| `422` | a field is missing or the job description is empty |
| `503` | the queue is full, try again later |

### `GET /api/jobs/{job_id}`

Poll this until `status` is `done` or `failed`.

```json
{
  "id": "…",
  "status": "queued | processing | done | failed",
  "step": "Verifying the quotes against the CV",
  "result": null,
  "error": null
}
```

- `step` is a short, human-readable text, set while `status` is `processing`. The frontend
  matches these exact texts to animate the architecture view (`frontend/src/lib/stages.ts`),
  so changing one means changing the frontend too:
  `Analyzing the job description`, `Searching the CV for evidence`,
  `Verifying the quotes against the CV`, `Computing the score`, `Writing suggestions`.
- `result` is set when `status` is `done`:

```json
{
  "score": 72,
  "breakdown": {
    "score": 72,
    "must_met": 4,
    "must_total": 6,
    "nice_met": 1,
    "nice_total": 2,
    "per_requirement": [
      {
        "requirement_id": 1,
        "text": "Experience with Python backend services",
        "kind": "must",
        "verdict": "yes | partial | no",
        "verified": true,
        "weight": 3,
        "outcome": 1.0,
        "points": 3.0
      }
    ]
  },
  "suggestions": [{"requirement_id": 3, "text": "If you used Docker in a project, say so."}]
}
```

- `error` is set when `status` is `failed`. It is always a message safe to show to the user.
- `404` means the job is unknown or expired (finished jobs are forgotten after `JOB_TTL_SECONDS`).

## Errors

Every 4xx/5xx above returns `{"detail": "<message>"}`, a message safe to show to the user,
for example `{"detail": "The service is busy, please try again later."}`.

One exception: when a field is missing, FastAPI's own validation answers `422` with `detail` as a
list of objects (`[{"loc": ["body", "cv"], "msg": "Field required", ...}]`), not a string.

## Rules

- The same CV file with the same job description gets the same answer: `POST /api/analyze`
  returns the `job_id` of the earlier job (waiting, running or done) instead of starting a new
  one. A failed job is never reused. Set `REUSE_RESULTS=false` to disable it.
- The score is a heuristic computed by code from the model's per-requirement verdicts. The UI
  should present it as an estimate, not as a truth.
- Verdicts are `yes`, `partial`, `no` (English).
- Uploaded CVs are deleted when the job ends. Logs never contain CV or job description text.
