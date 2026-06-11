import { useState, useEffect, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Download, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTasks } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { formatDateIST } from "@/lib/time";

interface StageRow {
  id: string;
  name: string;
  position: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  tat_hours: number;
  assignee_user_id: string | null;
}

const ReportsPage = () => {
  const { tasks: allTasks } = useTasks();
  const { accessScope } = useAuth();
  const { filterDepartments, filterProfiles, filterTasks } = useAccessScope();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stageRows, setStageRows] = useState<StageRow[]>([]);
  const [activeTab, setActiveTab] = useState("Overview");

  const scopedProfiles = useMemo(() => filterProfiles(profiles), [profiles, filterProfiles]);
  const scopedDepartments = useMemo(() => filterDepartments(departments), [departments, filterDepartments]);
  const tasks = useMemo(() => filterTasks(allTasks, profiles), [allTasks, profiles, filterTasks]);
  const deptNames = useMemo(() => scopedDepartments.map((d: { name: string }) => d.name), [scopedDepartments]);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    Promise.all([
      supabase.from("profiles").select("*").eq("active", true).order("performance_score", { ascending: false }),
      supabase.from("departments").select("*").order("name"),
      supabase.from("workflow_stages")
        .select("id,name,position,status,started_at,completed_at,tat_hours,assignee_user_id")
        .gte("started_at", since),
    ]).then(([p, d, s]) => {
      setProfiles(p.data || []);
      setDepartments(d.data || []);
      setStageRows((s.data as StageRow[]) || []);
    });
  }, []);

  const deptData = scopedDepartments.map(d => {
    const dt = tasks.filter(t => t.department_id === d.id);
    const done = dt.filter(t => t.status === "done").length;
    return { name: d.name, completion: dt.length > 0 ? Math.round((done / dt.length) * 100) : 0, total: dt.length };
  });

  const priorityData = [
    { name: "Critical", value: tasks.filter(t => t.priority === "critical").length, color: "hsl(0,72%,51%)" },
    { name: "High", value: tasks.filter(t => t.priority === "high").length, color: "hsl(38,92%,50%)" },
    { name: "Medium", value: tasks.filter(t => t.priority === "medium").length, color: "hsl(239,84%,67%)" },
    { name: "Low", value: tasks.filter(t => t.priority === "low").length, color: "hsl(142,71%,45%)" },
  ];

  // Workflow stage analytics — last 30 days
  const stageAnalytics = useMemo(() => {
    const byName = new Map<string, { name: string; samples: number[]; breaches: number; total: number; tat: number }>();
    stageRows.forEach((s) => {
      if (!s.started_at) return;
      const end = s.completed_at ? new Date(s.completed_at).getTime() : Date.now();
      const hours = (end - new Date(s.started_at).getTime()) / 3600000;
      const key = s.name;
      const e = byName.get(key) || { name: key, samples: [], breaches: 0, total: 0, tat: s.tat_hours };
      e.samples.push(hours);
      e.total++;
      e.tat = s.tat_hours; // last seen
      if (hours > s.tat_hours) e.breaches++;
      byName.set(key, e);
    });
    return Array.from(byName.values())
      .map((e) => ({
        name: e.name,
        avgHours: e.samples.length ? e.samples.reduce((a, b) => a + b, 0) / e.samples.length : 0,
        tat: e.tat,
        breaches: e.breaches,
        total: e.total,
        breachRate: e.total > 0 ? Math.round((e.breaches / e.total) * 100) : 0,
      }))
      .sort((a, b) => b.breachRate - a.breachRate || b.avgHours - a.avgHours);
  }, [stageRows]);

  const slowAssignees = useMemo(() => {
    const m = new Map<string, { id: string; samples: number[]; breaches: number }>();
    stageRows.forEach((s) => {
      if (!s.assignee_user_id || !s.started_at) return;
      const end = s.completed_at ? new Date(s.completed_at).getTime() : Date.now();
      const hours = (end - new Date(s.started_at).getTime()) / 3600000;
      const e = m.get(s.assignee_user_id) || { id: s.assignee_user_id, samples: [], breaches: 0 };
      e.samples.push(hours);
      if (hours > s.tat_hours) e.breaches++;
      m.set(s.assignee_user_id, e);
    });
    return Array.from(m.values())
      .map((e) => {
        const profile = scopedProfiles.find((p) => p.id === e.id);
        return {
          name: profile?.name || "Unknown",
          avgHours: e.samples.reduce((a, b) => a + b, 0) / e.samples.length,
          breaches: e.breaches,
          total: e.samples.length,
        };
      })
      .filter((x) => x.total >= 2)
      .sort((a, b) => b.avgHours - a.avgHours)
      .slice(0, 5);
  }, [stageRows, scopedProfiles]);

  const medals = ["🥇", "🥈", "🥉"];
  const getInitials = (name: string) => name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  const handleExport = () => {
    let csv = "";
    if (activeTab === "Overview" || activeTab === "Tasks") {
      csv = [
        ["Title", "Status", "Priority", "Due Date", "Department"].join(","),
        ...tasks.map(t => [`"${t.title}"`, t.status, t.priority, t.due_date || "", t.department_name || ""].join(","))
      ].join("\n");
    } else {
      csv = [
        ["Name", "Position", "Score"].join(","),
        ...scopedProfiles.map(p => [`"${p.name}"`, p.position || "", p.performance_score].join(","))
      ].join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `report-${activeTab.toLowerCase()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <PageHeader
        title="Reports"
        description={accessScope.hasFullAccess ? "Organization-wide analytics" : "Department team & task performance"}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-3.5 w-3.5 mr-1" />Export</Button>
        }
      />
      {accessScope.tier !== "member" && (
        <ScopeBanner scope={accessScope} departmentNames={deptNames} />
      )}

      <div className="flex gap-1 mb-2">
        {["Overview", "Workflows", "Performance", "Tasks"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Department Performance</h3>
            {deptData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No departments yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="completion" fill="hsl(239,84%,67%)" radius={[4, 4, 0, 0]} name="Completion %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Priority Distribution</h3>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No tasks yet</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={140} height={140}>
                  <PieChart>
                    <Pie data={priorityData.filter(p => p.value > 0)} dataKey="value" cx="50%" cy="50%" outerRadius={60} innerRadius={35}>
                      {priorityData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {priorityData.map(p => (
                    <div key={p.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-muted-foreground font-mono-num">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "Workflows" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-card rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Stages tracked (30d)</div>
              <div className="text-2xl font-semibold text-foreground tabular-nums mt-1">{stageRows.length}</div>
            </div>
            <div className="bg-card rounded-lg border p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />Breached</div>
              <div className="text-2xl font-semibold text-destructive tabular-nums mt-1">
                {stageAnalytics.reduce((a, b) => a + b.breaches, 0)}
              </div>
            </div>
            <div className="bg-card rounded-lg border p-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3 text-primary" />Avg cycle</div>
              <div className="text-2xl font-semibold text-foreground tabular-nums mt-1">
                {stageAnalytics.length
                  ? (stageAnalytics.reduce((a, b) => a + b.avgHours, 0) / stageAnalytics.length).toFixed(1)
                  : "0"}h
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">Stage performance</h3>
            <p className="text-xs text-muted-foreground mb-3">Sorted by breach rate — your biggest bottlenecks first.</p>
            {stageAnalytics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No workflow stages in the last 30 days yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Stage</th>
                      <th className="text-right py-2 px-2 font-medium">Avg time</th>
                      <th className="text-right py-2 px-2 font-medium">TAT</th>
                      <th className="text-right py-2 px-2 font-medium">Runs</th>
                      <th className="text-right py-2 px-2 font-medium">Breach rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageAnalytics.map((s) => (
                      <tr key={s.name} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="py-2 px-2 text-foreground">{s.name}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-foreground">{s.avgHours.toFixed(1)}h</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{s.tat}h</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{s.total}</td>
                        <td className="py-2 px-2 text-right">
                          <Badge variant="outline" className={
                            s.breachRate >= 50 ? "bg-destructive/10 text-destructive border-destructive/30" :
                            s.breachRate >= 20 ? "bg-warning/10 text-warning border-warning/30" :
                            "bg-success/10 text-success border-success/30"
                          }>
                            {s.breachRate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {slowAssignees.length > 0 && (
            <div className="bg-card rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">Slowest assignees</h3>
              <p className="text-xs text-muted-foreground mb-3">Average time to complete a stage (min 2 stages).</p>
              <table className="w-full text-sm">
                <tbody>
                  {slowAssignees.map((a) => (
                    <tr key={a.name} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-foreground">{a.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-foreground">{a.avgHours.toFixed(1)}h avg</td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{a.breaches}/{a.total} breached</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(activeTab === "Performance" || activeTab === "Overview") && (
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Employee Performance</h3>
          {scopedProfiles.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No team members yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">#</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Employee</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Position</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {scopedProfiles.map((u, i) => (
                    <tr key={u.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-center">{medals[i] || i + 1}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-medium">{getInitials(u.name)}</div>
                          <span className="text-foreground font-medium">{u.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{u.position || "—"}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full">
                            <div className={`h-full rounded-full ${u.performance_score >= 80 ? "bg-success" : u.performance_score >= 60 ? "bg-warning" : "bg-destructive"}`} style={{ width: `${u.performance_score}%` }} />
                          </div>
                          <span className="font-mono-num text-xs w-8 text-right">{u.performance_score}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "Tasks" && (
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">All Tasks</h3>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No tasks yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Title</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Priority</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Due</th>
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Dept</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => (
                    <tr key={t.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="py-2 px-2 text-foreground">{t.title}</td>
                      <td className="py-2 px-2 capitalize text-muted-foreground">{t.status.replace("_", " ")}</td>
                      <td className="py-2 px-2 capitalize text-muted-foreground">{t.priority}</td>
                      <td className="py-2 px-2 text-muted-foreground">{t.due_date ? formatDateIST(t.due_date) : "—"}</td>
                      <td className="py-2 px-2 text-muted-foreground">{t.department_name || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
