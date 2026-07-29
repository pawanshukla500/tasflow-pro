import { describe, it, expect } from "vitest";
import {
  PERFORMANCE_BASE_WEIGHTS,
  computeWeightedPerformanceScore,
} from "@/lib/performanceScoring";

describe("PERFORMANCE_BASE_WEIGHTS", () => {
  it("sums to 100", () => {
    const sum = Object.values(PERFORMANCE_BASE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });
});

describe("computeWeightedPerformanceScore", () => {
  it("does not dock task-only users for missing workflows", () => {
    const withWorkflowZero = computeWeightedPerformanceScore({
      tasksAssigned: 10,
      tasksCompleted: 10,
      taskCompletionRate: 100,
      onTimeRate: 100,
      overduePenalty: 100,
      workflowsAssigned: 0,
      workflowRate: 0,
      reviewsTotal: 0,
      qualityRate: 0,
      engagement: 100,
      responseTime: 100,
    });

    // Old buggy formula: 30+25+15+0+0+5+5 fixed weights with wf=0 → max ~85
    // Fair formula: renormalize → 100
    expect(withWorkflowZero.score).toBe(100);
    expect(withWorkflowZero.breakdown.some((b) => b.factor === "Workflow completion")).toBe(false);
  });

  it("does not apply on-time weight before any completions", () => {
    const result = computeWeightedPerformanceScore({
      tasksAssigned: 4,
      tasksCompleted: 0,
      taskCompletionRate: 0,
      onTimeRate: 0,
      overduePenalty: 100,
      workflowsAssigned: 0,
      workflowRate: 0,
      reviewsTotal: 0,
      qualityRate: 0,
      engagement: 0,
      responseTime: 100,
    });

    expect(result.breakdown.some((b) => b.factor === "On-time delivery")).toBe(false);
    // task 0*30 + overdue 100*15 + eng 0*5 + response 100*5 = 2000 / 55 ≈ 36
    expect(result.score).toBe(36);
  });

  it("includes workflow factor only when assigned", () => {
    const result = computeWeightedPerformanceScore({
      tasksAssigned: 0,
      tasksCompleted: 0,
      taskCompletionRate: 0,
      onTimeRate: 0,
      overduePenalty: 100,
      workflowsAssigned: 2,
      workflowRate: 100,
      reviewsTotal: 0,
      qualityRate: 0,
      engagement: 100,
      responseTime: 100,
    });

    expect(result.breakdown.some((b) => b.factor === "Workflow completion")).toBe(true);
    expect(result.breakdown.some((b) => b.factor === "Task completion")).toBe(false);
    expect(result.score).toBe(100);
  });

  it("applies quality only when reviews exist", () => {
    const noReviews = computeWeightedPerformanceScore({
      tasksAssigned: 5,
      tasksCompleted: 5,
      taskCompletionRate: 100,
      onTimeRate: 100,
      overduePenalty: 100,
      workflowsAssigned: 0,
      workflowRate: 0,
      reviewsTotal: 0,
      qualityRate: 0,
      engagement: 100,
      responseTime: 100,
    });
    const withBadReviews = computeWeightedPerformanceScore({
      tasksAssigned: 5,
      tasksCompleted: 5,
      taskCompletionRate: 100,
      onTimeRate: 100,
      overduePenalty: 100,
      workflowsAssigned: 0,
      workflowRate: 0,
      reviewsTotal: 4,
      qualityRate: 0,
      engagement: 100,
      responseTime: 100,
    });

    expect(noReviews.score).toBe(100);
    expect(withBadReviews.score).toBeLessThan(noReviews.score);
  });
});
