import { AlertTriangle, CheckCircle2, Clock, GitBranch, TrendingDown, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { UserPerformanceMetrics, PerformanceReason } from "@/hooks/usePerformance";

const impactIcon = (impact: PerformanceReason["impact"]) => {
  if (impact === "positive") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
  if (impact === "negative") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
};

interface Props {
  metrics: UserPerformanceMetrics;
  compact?: boolean;
  showReasons?: boolean;
}

export function PerformanceBreakdown({ metrics, compact = false, showReasons = true }: Props) {
  const factors = [
    { label: "Task completion", value: metrics.task_completion_rate, weight: 40 },
    { label: "On-time delivery", value: metrics.on_time_rate, weight: 25 },
    { label: "Workflow completion", value: metrics.workflow_completion_rate, weight: 20 },
    { label: "Quality / approvals", value: metrics.quality_rate, weight: 10 },
    { label: "Response time", value: metrics.collaboration_score, weight: 5 },
  ];

  const reasons = (metrics.deduction_reasons || []).filter(
    (r) => showReasons || r.impact === "negative",
  );

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Performance score</p>
          <p className="text-2xl font-bold font-mono-num">{metrics.performance_score}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground space-y-0.5">
          <p>{metrics.tasks_completed}/{metrics.tasks_assigned} tasks done</p>
          <p>{metrics.tasks_late} late · {metrics.tasks_overdue} overdue</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
        <Stat icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="On-time" value={`${Math.round(metrics.on_time_rate)}%`} />
        <Stat icon={<GitBranch className="h-3.5 w-3.5" />} label="Workflows" value={`${metrics.workflows_completed}/${metrics.workflows_assigned}`} />
        <Stat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Pending" value={String(metrics.tasks_pending)} />
      </div>

      {!compact && (
        <div className="space-y-2">
          {factors.map((f) => (
            <div key={f.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{f.label} ({f.weight}%)</span>
                <span className="font-mono-num font-medium">{Math.round(f.value)}%</span>
              </div>
              <Progress value={f.value} className="h-1.5" />
            </div>
          ))}
        </div>
      )}

      {showReasons && reasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">Score drivers</p>
          {reasons.map((r, i) => (
            <div key={`${r.type}-${i}`} className="flex items-start gap-2 text-xs rounded-md border px-2.5 py-2 bg-muted/30">
              {impactIcon(r.impact)}
              <span className="text-muted-foreground flex-1">{r.message}</span>
              {r.count > 0 && (
                <Badge variant="outline" className="text-[10px] h-5 shrink-0">{r.count}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-2 py-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">{icon}<span className="text-[10px]">{label}</span></div>
      <p className="text-sm font-semibold font-mono-num">{value}</p>
    </div>
  );
}
