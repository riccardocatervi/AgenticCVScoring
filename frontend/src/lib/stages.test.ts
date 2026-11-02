import { describe, expect, it } from "vitest";
import {
  STAGES,
  STARTING,
  TOTAL_FLOWS,
  cycleSeconds,
  doneNodes,
  firstPositionOf,
  locate,
  slotWindow,
  stageFor,
} from "./stages";

describe("stageFor", () => {
  it("maps every known backend step to its own stage", () => {
    STAGES.forEach((stage, index) => {
      const view = stageFor("processing", stage.step);
      expect(view.index).toBe(index);
      expect(view.stage).toBe(stage);
    });
  });

  it("treats a processing job without a step as the planning stage", () => {
    expect(stageFor("processing", null).stage).toBe(STARTING);
  });

  it("treats a queued job as waiting, whatever the step says", () => {
    expect(stageFor("queued", "Computing the score").index).toBeNull();
  });

  it("does not break on a step text it does not know", () => {
    const view = stageFor("processing", "Some future step");
    expect(view.index).toBeNull();
    expect(view.stage.nodes).toContain("orchestrator");
  });
});

describe("flows", () => {
  it("only move data between boxes that the stage marks as busy", () => {
    for (const stage of [STARTING, ...STAGES]) {
      for (const flow of stage.flows) {
        expect(stage.nodes, `${stage.short}: ${flow.label}`).toContain(flow.from);
        expect(stage.nodes, `${stage.short}: ${flow.label}`).toContain(flow.to);
      }
    }
  });

  it("give every message its own non-overlapping slot inside one loop", () => {
    for (const stage of STAGES) {
      const count = stage.flows.length;
      let previousEnd = 0;
      for (let position = 0; position < count; position++) {
        const { start, end } = slotWindow(position, count);
        expect(start).toBeGreaterThanOrEqual(previousEnd - 1e-9);
        expect(end).toBeGreaterThan(start);
        previousEnd = end;
      }
      expect(previousEnd).toBeLessThan(1);
      expect(cycleSeconds(stage)).toBeGreaterThan(0);
    }
  });
});

describe("doneNodes", () => {
  it("is empty at the start", () => {
    expect(doneNodes(null).size).toBe(0);
    expect(doneNodes(0).size).toBe(0);
  });

  it("marks the JD Analyst done once the Matcher is working", () => {
    const done = doneNodes(1);
    expect(done.has("jd_analyst")).toBe(true);
    expect(done.has("cv_matcher")).toBe(false);
  });

  it("never marks a busy node as done", () => {
    STAGES.forEach((stage, index) => {
      for (const node of stage.nodes) expect(doneNodes(index).has(node)).toBe(false);
    });
  });
});

describe("locate and firstPositionOf", () => {
  it("walks every message of every stage exactly once, in order", () => {
    const seen = Array.from({ length: TOTAL_FLOWS }, (_, p) => locate(p));
    const expected = STAGES.flatMap((stage, stageIndex) =>
      stage.flows.map((_, flowIndex) => ({ stageIndex, flowIndex })),
    );
    expect(seen).toEqual(expected);
  });

  it("clamps positions outside the range", () => {
    expect(locate(-3)).toEqual({ stageIndex: 0, flowIndex: 0 });
    const last = STAGES.length - 1;
    expect(locate(TOTAL_FLOWS + 10)).toEqual({
      stageIndex: last,
      flowIndex: (STAGES[last]?.flows.length ?? 1) - 1,
    });
  });

  it("finds the first message of each stage", () => {
    STAGES.forEach((_, stageIndex) => {
      expect(locate(firstPositionOf(stageIndex))).toEqual({ stageIndex, flowIndex: 0 });
    });
  });
});
