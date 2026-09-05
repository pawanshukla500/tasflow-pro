import { cn } from "@/lib/utils";
import {
  PROJECT_BLOCKED_STEP,
  PROJECT_FLOW_STEPS,
  type ProjectPipelineStatus,
  type ProjectPipelineSummary,
} from "@/lib/projectPipeline";

const HEALTH_STYLES: Record<ProjectPipelineSummary["health"], string> = {
  complete: "bg-success/15 text-success",
  blocked: "bg-destructive/15 text-destructive",
  delayed: "bg-warning/15 text-warning",
  in_progress: "bg-primary/12 text-primary",
  not_started: "bg-muted text-muted-foreground",
};

interface ProjectPipelineBarProps {
  summary: ProjectPipelineSummary;
  focusStatus: ProjectPipelineStatus | null;
  onSelectStep: (status: ProjectPipelineStatus) => void;
}

export function ProjectPipelineBar({ summary, focusStatus, onSelectStep }: ProjectPipelineBarProps) {
  const activeId = focusStatus ?? summary.currentStepId;
  const hasBlocked = summary.counts.blocked > 0;

  return (
    <div className="rounded-2xl border bg-card/80 px-3 py-3 md:px-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md", HEALTH_STYLES[summary.health])}>
            {summary.healthLabel}
          </span>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono-num font-semibold text-foreground">{summary.done}</span>
            {" of "}
            <span className="font-mono-num font-semibold text-foreground">{summary.total}</span>
            {" done"}
            {summary.total > 0 && (
              <span className="text-muted-foreground"> · {summary.percentComplete}%</span>
            )}
            {summary.overdue > 0 && (
              <span className="text-destructive font-medium"> · {summary.overdue} overdue</span>
            )}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground hidden sm:block">
          Click a step to focus that column
        </p>
      </div>

      {summary.total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-muted" aria-hidden>
          {PROJECT_FLOW_STEPS.map((step) => {
            const count = summary.counts[step.status];
            if (count <= 0) return null;
            return (
              <div
                key={step.id}
                className={cn("h-full min-w-[2px]", step.bar)}
                style={{ flexGrow: count }}
                title={`${step.label}: ${count}`}
              />
            );
          })}
          {hasBlocked && (
            <div
              className={cn("h-full min-w-[2px]", PROJECT_BLOCKED_STEP.bar)}
              style={{ flexGrow: summary.counts.blocked }}
              title={`Blocked: ${summary.counts.blocked}`}
            />
          )}
        </div>
      )}

      <ol className="grid grid-cols-5 gap-1.5">
        {[...PROJECT_FLOW_STEPS, PROJECT_BLOCKED_STEP].map((step, index) => {
          const count = summary.counts[step.status];
          const isActive = activeId === step.status;
          const isBlocked = step.status === "blocked";
          return (
            <li key={step.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectStep(step.status)}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 min-w-0 w-full rounded-xl border px-2 py-1.5 text-left transition-all h-full",
                  isActive
                    ? cn("bg-background shadow-sm ring-2", step.ring)
                    : isBlocked && hasBlocked
                      ? "bg-destructive/10 border-destructive/20 hover:bg-destructive/15"
                      : "bg-muted/40 border-transparent hover:bg-muted",
                )}
              >
                <span className={cn("hidden sm:inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-background shrink-0", step.accent)}>
                  {isBlocked ? "!" : index + 1}
                </span>
                <span className={cn("sm:hidden h-2 w-2 rounded-full shrink-0", step.accent)} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold truncate">{step.shortLabel}</span>
                  <span className="block text-[10px] text-muted-foreground font-mono-num">{count}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
