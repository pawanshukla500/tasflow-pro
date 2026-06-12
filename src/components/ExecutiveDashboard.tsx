import { useMemo } from "react";
import { Building2, TrendingDown, TrendingUp, Users, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  buildDepartmentPerformance,
  type UserPerformanceMetrics,
  type DepartmentPerformance,
} from "@/hooks/usePerformance";

interface Props {
  departments: { id: string; name: string }[];
  profiles: { id: string; name: string; department_id?: string | null }[];
  metrics: UserPerformanceMetrics[];
  tasks: { department_id?: string | null; status: string; due_date?: string | null; completed_on_time?: boolean | null }[];
  workflows: { raised_by_department_id?: string | null; status: string }[];
  summaryOnly?: boolean;
}

export function ExecutiveDashboard({
  departments,
  profiles,
  metrics,
  tasks,
  workflows,
  summaryOnly = false,
}: Props) {
  const deptPerf = useMemo(
    () => buildDepartmentPerformance(departments, profiles, metrics, tasks, workflows),
    [departments, profiles, metrics, tasks, workflows],
  );

  const topDepts = deptPerf.slice(0, 3);
  const bottomDepts = [...deptPerf].sort((a, b) => a.avg_score - b.avg_score).slice(0, 3);
  const topUsers = [...metrics].sort((a, b) => b.performance_score - a.performance_score).slice(0, 5);
  const orgAvg = metrics.length
    ? Math.round(metrics.reduce((s, m) => s + m.performance_score, 0) / metrics.length)
    : 0;
  const totalOverdue = metrics.reduce((s, m) => s + m.tasks_overdue, 0);
  const totalPendingWf = metrics.reduce(
    (s, m) => s + Math.max(0, m.workflows_assigned - m.workflows_completed),
    0,
  );

  if (summaryOnly) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Org avg score" value={String(orgAvg)} icon={<BarChart3 className="h-4 w-4" />} />
        <SummaryCard label="Top dept" value={topDepts[0]?.department_name || "—"} icon={<Building2 className="h-4 w-4" />} />
        <SummaryCard label="Overdue tasks" value={String(totalOverdue)} icon={<TrendingDown className="h-4 w-4" />} />
        <SummaryCard label="Pending workflows" value={String(totalPendingWf)} icon={<Users className="h-4 w-4" />} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Org average score" value={String(orgAvg)} icon={<BarChart3 className="h-4 w-4" />} />
        <SummaryCard label="Departments tracked" value={String(deptPerf.length)} icon={<Building2 className="h-4 w-4" />} />
        <SummaryCard label="Org-wide overdue" value={String(totalOverdue)} icon={<TrendingDown className="h-4 w-4" />} />
        <SummaryCard label="Pending workflow stages" value={String(totalPendingWf)} icon={<Users className="h-4 w-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <DeptRankCard title="Top performing departments" items={topDepts} variant="top" />
        <DeptRankCard title="Needs attention" items={bottomDepts} variant="bottom" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Department performance rankings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {deptPerf.map((d, i) => (
            <DeptRow key={d.department_id} rank={i + 1} dept={d} />
          ))}
          {deptPerf.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No department data yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">User performance rankings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topUsers.map((m, i) => {
            const profile = profiles.find((p) => p.id === m.user_id);
            return (
              <div key={m.user_id} className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-xs font-mono-num text-muted-foreground w-5">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{profile?.name || "Unknown"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.tasks_completed}/{m.tasks_assigned} tasks · {Math.round(m.on_time_rate)}% on-time
                  </p>
                </div>
                <Badge variant={m.performance_score >= 70 ? "default" : "destructive"} className="font-mono-num">
                  {m.performance_score}
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
        <p className="text-lg font-bold truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

function DeptRankCard({
  title,
  items,
  variant,
}: {
  title: string;
  items: DepartmentPerformance[];
  variant: "top" | "bottom";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          {variant === "top" ? <TrendingUp className="h-4 w-4 text-success" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((d) => (
          <div key={d.department_id} className="flex items-center justify-between text-sm">
            <span className="truncate">{d.department_name}</span>
            <Badge variant="outline" className="font-mono-num">{d.avg_score}</Badge>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">No data</p>}
      </CardContent>
    </Card>
  );
}

function DeptRow({ rank, dept }: { rank: number; dept: DepartmentPerformance }) {
  const completionPct = dept.tasks_total ? Math.round((dept.tasks_done / dept.tasks_total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono-num text-muted-foreground w-5">#{rank}</span>
          <span className="text-sm font-medium truncate">{dept.department_name}</span>
          <Badge variant="outline" className="text-[10px]">{dept.member_count} members</Badge>
        </div>
        <span className="text-sm font-bold font-mono-num">{dept.avg_score}</span>
      </div>
      <Progress value={completionPct} className="h-1.5" />
      <div className="flex gap-3 text-[10px] text-muted-foreground">
        <span>{dept.tasks_done}/{dept.tasks_total} tasks done</span>
        <span>{dept.on_time_pct}% on-time</span>
        <span>{dept.tasks_overdue} overdue</span>
        <span>{dept.pending_workflows} active workflows</span>
      </div>
    </div>
  );
}
