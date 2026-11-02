"""The score. Computed by code, never by the LLM."""

import math

from cvscore.schemas import Requirement, RequirementScore, ScoreResult, VerifiedMatch

MUST_WEIGHT = 3
NICE_WEIGHT = 1
_OUTCOME = {"yes": 1.0, "partial": 0.5, "no": 0.0}


def compute_score(requirements: list[Requirement], matches: list[VerifiedMatch]) -> ScoreResult:
    if not requirements:
        raise ValueError("at least one requirement is required")
    by_id = {r.id: r for r in requirements}
    if len(by_id) != len(requirements):
        raise ValueError("requirement ids must be unique")
    matched: dict[int, VerifiedMatch] = {}
    for match in matches:
        if match.requirement_id not in by_id:
            raise ValueError(f"match for unknown requirement {match.requirement_id}")
        if match.requirement_id in matched:
            raise ValueError(f"two matches for requirement {match.requirement_id}")
        matched[match.requirement_id] = match

    rows: list[RequirementScore] = []
    for req in requirements:
        weight = MUST_WEIGHT if req.kind == "must" else NICE_WEIGHT
        match = matched.get(req.id)
        verdict = match.verdict if match else "no"
        verified = match.verified if match else True
        outcome = _OUTCOME[verdict] if verified else 0.0
        rows.append(
            RequirementScore(
                requirement_id=req.id,
                text=req.text,
                kind=req.kind,
                verdict=verdict,
                verified=verified,
                weight=weight,
                outcome=outcome,
                points=weight * outcome,
            )
        )

    total_weight = sum(r.weight for r in rows)
    earned = sum(r.points for r in rows)
    fully_met = [r for r in rows if r.outcome == 1.0]
    return ScoreResult(
        score=math.floor(100 * earned / total_weight + 0.5),  # round half up
        must_met=sum(1 for r in fully_met if r.kind == "must"),
        must_total=sum(1 for r in rows if r.kind == "must"),
        nice_met=sum(1 for r in fully_met if r.kind == "nice"),
        nice_total=sum(1 for r in rows if r.kind == "nice"),
        per_requirement=rows,
    )
