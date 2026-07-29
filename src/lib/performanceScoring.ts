/**
 * Mirrors `recalculate_user_performance` (performance scoring fairness migration).
 * Used for unit tests and UI fallback math so weights stay consistent with the DB.
 *
 * Base weights (sum 100). Inactive factors are dropped and remaining weights
 * are renormalized so missing workflows / reviews never silently dock the score.
 */
export const PERFORMANCE_BASE_WEIGHTS = {
  taskCompletion: 30,
  onTime: 25,
  overdueHealth: 15,
  workflow: 10,
  quality: 10,
  engagement: 5,
  responseTime: 5,
} as const;

export interface PerformanceFactorInputs {
  tasksAssigned: number;
  tasksCompleted: number;
  taskCompletionRate: number;
  onTimeRate: number;
  overduePenalty: number;
  workflowsAssigned: number;
  workflowRate: number;
  reviewsTotal: number;
  qualityRate: number;
  engagement: number;
  responseTime: number;
}

export interface PerformanceFactorBreakdown {
  factor: string;
  /** Nominal base weight before renormalization */
  weight: number;
  /** Effective weight after dropping N/A factors (sums to 100 when any active) */
  effectiveWeight: number;
  value: number;
  contribution: number;
}

export function computeWeightedPerformanceScore(input: PerformanceFactorInputs): {
  score: number;
  breakdown: PerformanceFactorBreakdown[];
} {
  const candidates: {
    factor: string;
    baseWeight: number;
    value: number;
    active: boolean;
  }[] = [
    {
      factor: "Task completion",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.taskCompletion,
      value: input.taskCompletionRate,
      active: input.tasksAssigned > 0,
    },
    {
      factor: "On-time delivery",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.onTime,
      value: input.onTimeRate,
      active: input.tasksCompleted > 0,
    },
    {
      factor: "Overdue health",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.overdueHealth,
      value: input.overduePenalty,
      active: input.tasksAssigned > 0,
    },
    {
      factor: "Workflow completion",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.workflow,
      value: input.workflowRate,
      active: input.workflowsAssigned > 0,
    },
    {
      factor: "Quality / reviews",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.quality,
      value: input.qualityRate,
      active: input.reviewsTotal > 0,
    },
    {
      factor: "Recent activity",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.engagement,
      value: input.engagement,
      active: true,
    },
    {
      factor: "Response time",
      baseWeight: PERFORMANCE_BASE_WEIGHTS.responseTime,
      value: input.responseTime,
      active: true,
    },
  ];

  const active = candidates.filter((c) => c.active);
  const weightSum = active.reduce((s, c) => s + c.baseWeight, 0);

  if (weightSum <= 0) {
    return { score: 0, breakdown: [] };
  }

  const breakdown: PerformanceFactorBreakdown[] = active.map((c) => {
    const effectiveWeight = Math.round((c.baseWeight / weightSum) * 1000) / 10;
    const contribution = Math.round((c.value * c.baseWeight) / weightSum);
    return {
      factor: c.factor,
      weight: c.baseWeight,
      effectiveWeight,
      value: Math.round(c.value),
      contribution,
    };
  });

  const raw =
    active.reduce((s, c) => s + c.value * c.baseWeight, 0) / weightSum;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return { score, breakdown };
}
