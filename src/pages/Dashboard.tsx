import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Clock, AlertTriangle, Loader2, CheckCircle2, Target, Users, Download, Plus,
  Sparkles, TrendingUp, TrendingDown, GitBranch, ArrowRight, Activity, ListTodo,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { supabase } from "@/integrations/supabase/client";
import { usePerformance } from "@/hooks/usePerformance";
import { useUserRolesMap } from "@/hooks/useUserRolesMap";
import { filterPerformanceLeaderboardProfiles } from "@/lib/performanceVisibility";
import { useTasks } from "@/hooks/useTasks";
import CreateTaskModal from "@/components/CreateTaskModal";
import { PageHeader } from "@/components/PageHeader";
import { CountUp } from "@/components/motion";
import { todayIST, formatDateIST, IST_TIME_ZONE } from "@/lib/time";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Scope = "all" | "my_department" | "assigned_to_me" | "assigned_by_me";

interface WorkflowRow {
  id: string;
  title: string;
  status: string;
  current_stage_position: number;
  priority: string;
  created_at: string;
  total_stages: number;
}

const istDateOf = (ts: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIME_ZONE }).format(new Date(ts));

/** Tiny inline sparkline (SVG) for KPI cards. */
const Sparkline = ({ points, className = "" }: { points: number[]; className?: string }) => {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const w = 72, h = 24;
  const step = w / (points.length - 1);
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1.5).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
};

/** ▲ / ▼ percentage chip comparing two values. */
const TrendChip = ({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) => {
  if (previous === 0 && current === 0) return null;
  const pct = previous === 0 ? 100 : Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  const good = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
      good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
    }`}>
      <Icon className="h-2.5 w-2.5" />
      {Math.abs(pct)}%
    </span>
  );
};

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border rounded-lg shadow-lg px-3 py-2 text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-mono-num font-semibold text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

const statusLabels: Record<string, string> = {
  todo: "To Do", in_progress: "In Progress", pending_review: "Pending Review", in_review: "In Review", done: "Done", blocked: "Blocked",
};
// Hex (not hsl strings) so badge backgrounds can append alpha like `${color}14`
const statusColors: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#6366f1",
  pending_review: "#f59e0b",
  in_review: "#f59e0b",
  done: "#22c55e",
  blocked: "#dc2626",
};
const priorityColors: Record<string, string> = {
  critical: "#dc2626", high: "#f59e0b", medium: "#6366f1", low: "#22c55e",
};
const workflowStatusStyle: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  on_hold: "bg-warning/10 text-warning",
  cancelled: "bg-destructive/10 text-destructive",
};

const Dashboard = () => {
  const { tasks: allTasks, loading: tasksLoading, fetchTasks } = useTasks();
  const { user, accessScope } = useAuth();
  const { filterDepartments, filterProfiles, filterTasks } = useAccessScope();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [motivation, setMotivation] = useState<{ quote: string; author: string } | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [userFilter, setUserFilter] = useState<string>("all");

  const today = todayIST();
  const firstName = user?.profile?.name?.split(" ")[0] || "User";

  const rolesByUserId = useUserRolesMap();
  const scopedProfiles = useMemo(
    () => filterProfiles(profiles),
    [profiles, filterProfiles],
  );
  const leaderboardProfiles = useMemo(
    () => filterPerformanceLeaderboardProfiles(scopedProfiles, rolesByUserId),
    [scopedProfiles, rolesByUserId],
  );
  const { metrics: perfMetrics } = usePerformance(leaderboardProfiles.map((p: { id: string }) => p.id));

  const scopedDepartments = useMemo(
    () => filterDepartments(departments),
    [departments, filterDepartments],
  );

  const deptNames = useMemo(
    () => scopedDepartments.map((d: { name: string }) => d.name),
    [scopedDepartments],
  );

  const tasks = useMemo(() => {
    if (!user) return allTasks;
    let filtered = filterTasks(allTasks, profiles);
    if (scope === "assigned_to_me") filtered = filtered.filter(t => t.assignees.some(a => a.user_id === user.id));
    else if (scope === "assigned_by_me") filtered = filtered.filter(t => t.created_by === user.id);
    else if (scope === "my_department" && accessScope.departmentIds?.length) {
      const teamIds = new Set(scopedProfiles.map((p: { id: string }) => p.id));
      filtered = filtered.filter(
        (t) =>
          (t.department_id && accessScope.departmentIds!.includes(t.department_id)) ||
          teamIds.has(t.created_by || "") ||
          t.assignees.some((a) => teamIds.has(a.user_id)),
      );
    }
    if (accessScope.canViewDeptPerformance && userFilter !== "all") {
      filtered = filtered.filter(t => t.assignees.some(a => a.user_id === userFilter) || t.created_by === userFilter);
    }
    return filtered;
  }, [allTasks, scope, user, userFilter, accessScope, profiles, scopedProfiles, filterTasks]);

  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("profiles").select("*").eq("active", true).order("performance_score", { ascending: false }),
      supabase.from("workflows").select("id, title, status, current_stage_position, priority, created_at").order("created_at", { ascending: false }).limit(6),
      supabase.from("workflow_stages").select("workflow_id"),
    ]).then(([d, p, w, ws]) => {
      setDepartments(d.data || []);
      setProfiles(p.data || []);
      const stageCounts = new Map<string, number>();
      for (const s of ws.data || []) stageCounts.set(s.workflow_id, (stageCounts.get(s.workflow_id) || 0) + 1);
      setWorkflows((w.data || []).map(wf => ({ ...wf, total_stages: stageCounts.get(wf.id) || 0 })));
    });

    const cacheKey = `motivation:${today}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setMotivation(JSON.parse(cached)); return; } catch {}
    }
    supabase.functions.invoke("daily-motivation", { body: {} }).then(({ data }) => {
      if (data?.quote) {
        const m = { quote: data.quote, author: data.author || "TaskFlow Pro" };
        setMotivation(m);
        localStorage.setItem(cacheKey, JSON.stringify(m));
      }
    }).catch(() => {/* silent */});
  }, []);

  // ── KPI + trend computations ─────────────────────────────────────
  const dueTodayCount = tasks.filter(t => t.due_date === today && t.status !== "done").length;
  const dueTomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const tomorrow = istDateOf(d.toISOString());
    return tasks.filter(t => t.due_date === tomorrow && t.status !== "done").length;
  }, [tasks]);
  const overdueCount = tasks.filter(t => t.due_date && t.due_date < today && t.status !== "done").length;
  const overdueHigh = tasks.filter(t => t.due_date && t.due_date < today && t.status !== "done" && (t.priority === "high" || t.priority === "critical")).length;
  const inProgressCount = tasks.filter(t => t.status === "in_progress").length;
  const inReviewCount = tasks.filter(t => t.status === "pending_review" || t.status === "in_review").length;
  const doneCount = tasks.filter(t => t.status === "done").length;

  // last 14 IST days of activity, plus week-over-week completion trend
  const { activitySeries, createdSpark, completedSpark, completedThisWeek, completedLastWeek } = useMemo(() => {
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(istDateOf(d.toISOString()));
    }
    const createdBy = new Map<string, number>();
    const completedBy = new Map<string, number>();
    for (const t of tasks) {
      if (t.created_at) {
        const k = istDateOf(t.created_at);
        createdBy.set(k, (createdBy.get(k) || 0) + 1);
      }
      if (t.completed_at) {
        const k = istDateOf(t.completed_at);
        completedBy.set(k, (completedBy.get(k) || 0) + 1);
      }
    }
    const series = days.map(d => ({
      day: formatDateIST(d, { day: "numeric", month: "short" }),
      Created: createdBy.get(d) || 0,
      Completed: completedBy.get(d) || 0,
    }));
    const last7 = days.slice(7), prev7 = days.slice(0, 7);
    const sum = (ds: string[], m: Map<string, number>) => ds.reduce((a, d) => a + (m.get(d) || 0), 0);
    return {
      activitySeries: series,
      createdSpark: last7.map(d => createdBy.get(d) || 0),
      completedSpark: last7.map(d => completedBy.get(d) || 0),
      completedThisWeek: sum(last7, completedBy),
      completedLastWeek: sum(prev7, completedBy),
    };
  }, [tasks]);

  const statusData = useMemo(() =>
    ["todo", "in_progress", "pending_review", "done", "blocked"]
      .map(s => ({ key: s, name: statusLabels[s], value: tasks.filter(t => t.status === s || (s === "pending_review" && t.status === "in_review")).length, color: statusColors[s] }))
      .filter(s => s.value > 0),
  [tasks]);

  const kpis = [
    { label: "Due Today", value: dueTodayCount, icon: Clock, tone: "text-warning", chipBg: "from-warning/20 to-warning/5", sub: `${dueTomorrow} due tomorrow`, spark: createdSpark },
    { label: "Overdue", value: overdueCount, icon: AlertTriangle, tone: "text-destructive", chipBg: "from-destructive/20 to-destructive/5", sub: overdueHigh > 0 ? `${overdueHigh} high priority` : "none high priority", spark: null },
    { label: "In Progress", value: inProgressCount, icon: Loader2, tone: "text-primary", chipBg: "from-primary/20 to-primary/5", sub: `${inReviewCount} in review`, spark: createdSpark },
    { label: "Completed", value: doneCount, icon: CheckCircle2, tone: "text-success", chipBg: "from-success/20 to-success/5", sub: `${completedThisWeek} this week`, spark: completedSpark, trend: { current: completedThisWeek, previous: completedLastWeek } },
  ];

  const activeWorkflows = workflows.filter(w => w.status === "active");
  const topPerformers = useMemo(() => {
    const metricsByUser = new Map(perfMetrics.map((m) => [m.user_id, m]));
    return leaderboardProfiles
      .slice()
      .sort((a, b) => {
        const ma = metricsByUser.get(a.id);
        const mb = metricsByUser.get(b.id);
        const aHas = ma?.has_sufficient_data ?? false;
        const bHas = mb?.has_sufficient_data ?? false;
        if (aHas !== bHas) return aHas ? -1 : 1;
        return (mb?.performance_score ?? 0) - (ma?.performance_score ?? 0);
      })
      .slice(0, 5);
  }, [leaderboardProfiles, perfMetrics]);
  const medals = ["🥇", "🥈", "🥉"];
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const handleExport = () => {
    const csv = [
      ["Title", "Status", "Priority", "Due Date", "Department"].join(","),
      ...tasks.map(t => [`"${t.title}"`, statusLabels[t.status] || t.status, t.priority, t.due_date || "", t.department_name || ""].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report-${today}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const canCreateTask = accessScope.canCreateTasks;
  const showLeadershipPanels = accessScope.canViewDeptPerformance;
  const ongoing = tasks
    .filter(t => t.status !== "done")
    .sort((a, b) => (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31"));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title={`Hello, ${firstName} 👋`}
        description={formatDateIST(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={
          <>
            <Button variant="outline" size="sm" className="press-scale" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" />Export
            </Button>
            {canCreateTask && (
              <Button size="sm" className="press-scale hover:shadow-lg hover:shadow-primary/25" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />New Task
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-6">

        {accessScope.tier !== "member" && (
          <ScopeBanner scope={accessScope} departmentNames={deptNames} />
        )}

        {motivation && (
          <p className="text-xs text-muted-foreground italic flex items-start gap-1.5 animate-fade-in">
            <Sparkles className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
            <span>"{motivation.quote}" <span className="opacity-60 not-italic">— {motivation.author}</span></span>
          </p>
        )}

        {/* Scope filter */}
        <div className="flex flex-wrap items-center gap-2 animate-rise">
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit border">
            {([
              { id: "all", label: accessScope.hasFullAccess ? "All Tasks" : "Team Tasks" },
              ...(accessScope.isManager && accessScope.departmentIds?.length
                ? [{ id: "my_department" as Scope, label: "My Department" }]
                : []),
              { id: "assigned_to_me", label: "Assigned to me" },
              { id: "assigned_by_me", label: "Assigned by me" },
            ] as { id: Scope; label: string }[]).map(opt => (
              <button
                key={opt.id}
                onClick={() => setScope(opt.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all press-scale ${scope === opt.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {accessScope.canViewDeptPerformance && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 w-[200px] text-xs rounded-xl">
                <SelectValue placeholder="Filter by user…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All team members</SelectItem>
                {scopedProfiles.map((p: { id: string; name: string }) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <span className="ml-1 text-[11px] text-muted-foreground tabular-nums">{tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
        </div>

        {/* ── KPI cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger-children">
          {kpis.map(kpi => (
            <div key={kpi.label} className="card-premium p-4 md:p-5 hover-lift group">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.chipBg} flex items-center justify-center ${kpi.tone} group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                  <kpi.icon className="h-[18px] w-[18px]" />
                </div>
                {kpi.trend ? <TrendChip current={kpi.trend.current} previous={kpi.trend.previous} /> : kpi.spark ? (
                  <Sparkline points={kpi.spark} className={kpi.tone} />
                ) : null}
              </div>
              <p className="text-stat text-3xl text-foreground leading-none">
                <CountUp value={kpi.value} />
              </p>
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-2 font-semibold">{kpi.label}</p>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Analytics ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-5">
          {/* Daily activity */}
          <div className="card-premium p-5 lg:col-span-3 animate-rise [animation-delay:160ms]">
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="section-label">Last 14 days</p>
                <h3 className="text-sm font-semibold text-foreground mt-0.5 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-primary" />Daily Activity
                </h3>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />Created</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" />Completed</span>
              </div>
            </div>
            <div className="h-[210px] mt-3 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activitySeries} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(239,84%,67%)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(239,84%,67%)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142,71%,45%)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(142,71%,45%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeDasharray: "4 4" }} />
                  <Area type="monotone" dataKey="Created" stroke="hsl(239,84%,67%)" strokeWidth={2} fill="url(#gradCreated)" dot={false} activeDot={{ r: 3.5 }} animationDuration={900} />
                  <Area type="monotone" dataKey="Completed" stroke="hsl(142,71%,45%)" strokeWidth={2} fill="url(#gradCompleted)" dot={false} activeDot={{ r: 3.5 }} animationDuration={900} animationBegin={150} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status donut */}
          <div className="card-premium p-5 lg:col-span-2 animate-rise [animation-delay:240ms]">
            <p className="section-label">Distribution</p>
            <h3 className="text-sm font-semibold text-foreground mt-0.5 mb-2 flex items-center gap-1.5">
              <ListTodo className="h-3.5 w-3.5 text-primary" />Workflow Status
            </h3>
            {statusData.length === 0 ? (
              <div className="h-[180px] flex flex-col items-center justify-center text-center gap-2">
                <p className="text-sm text-muted-foreground">No tasks yet</p>
                {canCreateTask && (
                  <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1" />Create one
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative h-[170px] w-1/2 min-w-[130px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={3} strokeWidth={0} animationDuration={800}>
                        {statusData.map(s => <Cell key={s.key} fill={s.color} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-stat text-2xl text-foreground leading-none"><CountUp value={tasks.length} /></p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">tasks</p>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {statusData.map(s => (
                    <div key={s.key} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />{s.name}
                      </span>
                      <span className="font-mono-num font-semibold text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Active workflows + pending tasks ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
          <div className="card-premium p-5 animate-rise [animation-delay:200ms]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-label">Active projects</p>
                <h3 className="text-sm font-semibold text-foreground mt-0.5 flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5 text-primary" />Workflows
                </h3>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary" onClick={() => navigate("/workflows")}>
                View all<ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            {activeWorkflows.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No active workflows</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/workflows")}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Raise a workflow
                </Button>
              </div>
            ) : (
              <div className="space-y-3 stagger-children">
                {activeWorkflows.slice(0, 5).map(wf => {
                  const pct = wf.total_stages > 0 ? Math.round(((wf.current_stage_position - 1) / wf.total_stages) * 100) : 0;
                  return (
                    <button key={wf.id} onClick={() => navigate("/workflows")} className="w-full text-left p-3 rounded-xl border bg-background/40 hover:border-primary/30 hover:bg-muted/40 transition-all group">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{wf.title}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${workflowStatusStyle[wf.status] || "bg-muted text-muted-foreground"}`}>
                          {wf.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70 bar-grow" style={{ width: `${Math.max(pct, 4)}%` }} />
                        </div>
                        <span className="text-[10px] font-mono-num text-muted-foreground shrink-0">
                          Stage {wf.current_stage_position}/{wf.total_stages || "?"}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: priorityColors[wf.priority] || priorityColors.medium }} title={`${wf.priority} priority`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending tasks */}
          <div className="card-premium p-5 animate-rise [animation-delay:260ms]">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="section-label">Needs attention</p>
                <h3 className="text-sm font-semibold text-foreground mt-0.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-warning" />Pending Tasks
                  {ongoing.length > 0 && <Badge variant="secondary" className="font-mono-num text-[10px] ml-1">{ongoing.length}</Badge>}
                </h3>
              </div>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary" onClick={() => navigate("/my-tasks")}>
                My Tasks<ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
            {ongoing.length === 0 ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/50 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All caught up — nothing pending</p>
              </div>
            ) : (
              <div className="space-y-0.5 max-h-[290px] overflow-y-auto stagger-children">
                {ongoing.slice(0, 8).map(task => {
                  const isOverdue = task.due_date && task.due_date < today;
                  const isDueToday = task.due_date === today;
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all group">
                      <div className="w-2 h-2 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }} />
                      <span className="flex-1 text-sm text-foreground truncate">{task.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0 hidden sm:inline-flex border-0 px-2" style={{ color: statusColors[task.status], background: `${statusColors[task.status]}14` }}>
                        {statusLabels[task.status] || task.status}
                      </Badge>
                      {task.due_date && (
                        <span className={`text-[11px] shrink-0 font-mono-num ${isOverdue ? "text-destructive font-semibold" : isDueToday ? "text-warning font-medium" : "text-muted-foreground"}`}>
                          {formatDateIST(task.due_date)}{isOverdue && " ⚠"}
                        </span>
                      )}
                      <div className="flex -space-x-1.5 shrink-0">
                        {task.assignees.slice(0, 2).map(a => (
                          <div key={a.user_id} className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-[9px] font-bold border-2 border-card" title={a.name}>
                            {getInitials(a.name)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {ongoing.length > 8 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-2">+ {ongoing.length - 8} more in My Tasks</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Team performance + departments (managers) ─────────── */}
        {showLeadershipPanels && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-5">
            <div className="card-premium p-5 animate-rise [animation-delay:220ms]">
              <p className="section-label">Leaderboard</p>
              <h3 className="text-sm font-semibold text-foreground mt-0.5 mb-4 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" />Team Performance
              </h3>
              {topPerformers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No team members yet</p>
              ) : (
                <div className="space-y-3 stagger-children">
                  {topPerformers.map((u, i) => {
                    const m = perfMetrics.find((pm) => pm.user_id === u.id);
                    const hasData = m?.has_sufficient_data ?? false;
                    const score = hasData ? u.performance_score : null;
                    return (
                    <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                      <span className="w-6 text-center text-sm">{medals[i] || <span className="text-[11px] text-muted-foreground font-mono-num">{i + 1}</span>}</span>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-[10px] font-bold ring-2 ring-background shadow-sm">
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : getInitials(u.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{u.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{u.position || "Team Member"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {score === null ? (
                          <span className="text-[10px] text-muted-foreground">N/A</span>
                        ) : (
                        <>
                        <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-success to-success/70 bar-grow" style={{ width: `${score}%`, animationDelay: `${300 + i * 80}ms` }} />
                        </div>
                        <span className="text-[10px] font-mono-num text-foreground font-semibold w-8 text-right">{score}%</span>
                        </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="card-premium p-5 animate-rise [animation-delay:280ms]">
              <p className="section-label">By department</p>
              <h3 className="text-sm font-semibold text-foreground mt-0.5 mb-4 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />Department Overview
              </h3>
              {scopedDepartments.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No departments yet</p>
              ) : (
                <div className="space-y-3.5 stagger-children">
                  {scopedDepartments.map((d, i) => {
                    const deptTasks = tasks.filter(t => t.department_id === d.id);
                    const deptDone = deptTasks.filter(t => t.status === "done").length;
                    const completionRate = deptTasks.length > 0 ? Math.round((deptDone / deptTasks.length) * 100) : 0;
                    const overdue = deptTasks.filter(t => t.due_date && t.due_date < today && t.status !== "done").length;
                    return (
                      <div key={d.id} className="p-2.5 rounded-xl hover:bg-muted/40 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full ring-4 ring-transparent" style={{ backgroundColor: d.color, boxShadow: `0 0 0 3px ${d.color}22` }} />
                            <span className="text-xs font-semibold text-foreground">{d.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {overdue > 0 && <Badge variant="destructive" className="text-[9px] px-1.5 py-0">{overdue} overdue</Badge>}
                            <span className="text-[10px] font-mono-num text-muted-foreground">{deptTasks.length} tasks</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full bar-grow ${completionRate >= 80 ? "bg-gradient-to-r from-success to-success/70" : completionRate >= 60 ? "bg-gradient-to-r from-primary to-primary/70" : "bg-gradient-to-r from-warning to-warning/70"}`} style={{ width: `${completionRate}%`, animationDelay: `${350 + i * 80}ms` }} />
                          </div>
                          <span className="text-[10px] font-mono-num text-foreground font-semibold w-8 text-right">{completionRate}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Recent tasks ──────────────────────────────────────── */}
        <div className="card-premium p-5 animate-rise [animation-delay:300ms]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="section-label">Latest</p>
              <h3 className="text-sm font-semibold text-foreground mt-0.5">Recent Tasks</h3>
            </div>
            <Badge variant="secondary" className="font-mono-num text-[10px]">{tasks.length} total</Badge>
          </div>
          {tasksLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No tasks yet</p>
              {canCreateTask && (
                <Button size="sm" className="mt-3" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Create your first task
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5 stagger-children">
              {tasks.slice(0, 8).map(task => (
                <div key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-all group">
                  <div className="w-2 h-2 rounded-full shrink-0 group-hover:scale-125 transition-transform" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }} />
                  <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">{task.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0 border-0 px-2" style={{ color: statusColors[task.status], background: `${statusColors[task.status]}14` }}>
                    {statusLabels[task.status] || task.status}
                  </Badge>
                  {task.due_date && (
                    <span className={`text-[11px] shrink-0 font-mono-num ${task.due_date < today && task.status !== "done" ? "text-destructive font-medium" : task.due_date === today ? "text-warning" : "text-muted-foreground"}`}>
                      {formatDateIST(task.due_date)}
                    </span>
                  )}
                  <div className="flex -space-x-1.5 shrink-0">
                    {task.assignees.slice(0, 2).map(a => (
                      <div key={a.user_id} className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-[9px] font-bold border-2 border-card">
                        {getInitials(a.name)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={fetchTasks} />}
    </div>
  );
};

export default Dashboard;
