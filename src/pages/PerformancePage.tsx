import { useEffect, useState, useMemo } from "react";
import { Plus, Target, Trash2, TrendingUp, Users as UsersIcon, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { formatDateIST } from "@/lib/time";
import { usePerformance } from "@/hooks/usePerformance";
import { useTasks } from "@/hooks/useTasks";
import { PerformanceBreakdown } from "@/components/PerformanceBreakdown";
import { ExecutiveDashboard } from "@/components/ExecutiveDashboard";
import { useUserRolesMap } from "@/hooks/useUserRolesMap";
import {
  filterPerformanceLeaderboardProfiles,
  filterPerformanceMetrics,
  shouldShowInPerformanceLeaderboard,
} from "@/lib/performanceVisibility";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KRA {
  id: string; user_id: string; title: string; description: string | null;
  weight: number; period: string; status: string; target_date: string | null;
}
interface KPI {
  id: string; user_id: string; kra_id: string | null; title: string; metric: string | null;
  target_value: number; current_value: number; unit: string | null; period: string; status: string;
}
interface Member { id: string; name: string; }

const statusColors: Record<string, string> = {
  on_track: "bg-success/15 text-success border-success/30",
  at_risk: "bg-warning/15 text-warning border-warning/30",
  off_track: "bg-destructive/15 text-destructive border-destructive/30",
  achieved: "bg-primary/15 text-primary border-primary/30",
};

const PerformancePage = () => {
  const { user, accessScope } = useAuth();
  const { filterProfiles, filterDepartments } = useAccessScope();
  const { tasks } = useTasks();
  const [scope, setScope] = useState<string>("me");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [workflows, setWorkflows] = useState<{ raised_by_department_id?: string | null; status: string; completed_at?: string | null }[]>([]);
  const [allProfiles, setAllProfiles] = useState<{ id: string; name: string; department_id?: string | null }[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [kras, setKras] = useState<KRA[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKra, setShowKra] = useState(false);
  const [showKpi, setShowKpi] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string>(user?.id || "");

  // KRA form
  const [kraTitle, setKraTitle] = useState("");
  const [kraDesc, setKraDesc] = useState("");
  const [kraWeight, setKraWeight] = useState("0");
  const [kraPeriod, setKraPeriod] = useState("quarterly");
  const [kraStatus, setKraStatus] = useState("on_track");
  const [kraTargetDate, setKraTargetDate] = useState("");

  // KPI form
  const [kpiTitle, setKpiTitle] = useState("");
  const [kpiMetric, setKpiMetric] = useState("");
  const [kpiTarget, setKpiTarget] = useState("0");
  const [kpiCurrent, setKpiCurrent] = useState("0");
  const [kpiUnit, setKpiUnit] = useState("");
  const [kpiPeriod, setKpiPeriod] = useState("monthly");
  const [kpiStatus, setKpiStatus] = useState("on_track");
  const [kpiKraId, setKpiKraId] = useState<string>("none");

  useEffect(() => {
    if (!user) return;
    setEditingUserId(user.id);
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    const [kraRes, kpiRes, profilesRes, deptRes, wfRes] = await Promise.all([
      supabase.from("kras" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("kpis" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name"),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("workflows").select("raised_by_department_id, status, completed_at"),
    ]);
    setKras((kraRes.data as any) || []);
    setKpis((kpiRes.data as any) || []);
    const profs = (profilesRes.data as any) || [];
    setMembers(profs);
    setAllProfiles(profs);
    setDepartments(filterDepartments((deptRes.data as any) || []));
    setWorkflows((wfRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const rolesByUserId = useUserRolesMap();

  const teamMembers = useMemo(
    () => filterProfiles(members).filter((m) => shouldShowInPerformanceLeaderboard(rolesByUserId.get(m.id) ?? ["employee"])),
    [members, filterProfiles, rolesByUserId],
  );

  const teamMemberIds = useMemo(
    () => new Set(teamMembers.map((m) => m.id)),
    [teamMembers],
  );

  const visibleKras = scope === "me"
    ? kras.filter(k => k.user_id === user?.id)
    : scope === "all"
      ? (accessScope.hasFullAccess ? kras : kras.filter(k => teamMemberIds.has(k.user_id)))
      : kras.filter(k => k.user_id === scope);

  const visibleKpis = scope === "me"
    ? kpis.filter(k => k.user_id === user?.id)
    : scope === "all"
      ? (accessScope.hasFullAccess ? kpis : kpis.filter(k => teamMemberIds.has(k.user_id)))
      : kpis.filter(k => k.user_id === scope);

  const myKras = kras.filter(k => k.user_id === user?.id);

  const resetKra = () => {
    setKraTitle(""); setKraDesc(""); setKraWeight("0");
    setKraPeriod("quarterly"); setKraStatus("on_track"); setKraTargetDate("");
  };
  const resetKpi = () => {
    setKpiTitle(""); setKpiMetric(""); setKpiTarget("0"); setKpiCurrent("0");
    setKpiUnit(""); setKpiPeriod("monthly"); setKpiStatus("on_track"); setKpiKraId("none");
  };

  const saveKra = async () => {
    if (!kraTitle.trim()) return toast.error("Title required");
    const { error } = await supabase.from("kras" as any).insert({
      user_id: user?.id,
      title: kraTitle.trim(), description: kraDesc || null,
      weight: Number(kraWeight) || 0, period: kraPeriod, status: kraStatus,
      target_date: kraTargetDate || null,
    });
    if (error) return toast.error(error.message);
    toast.success("KRA added");
    setShowKra(false); resetKra(); fetchData();
  };

  const saveKpi = async () => {
    if (!kpiTitle.trim()) return toast.error("Title required");
    const { error } = await supabase.from("kpis" as any).insert({
      user_id: user?.id,
      kra_id: kpiKraId === "none" ? null : kpiKraId,
      title: kpiTitle.trim(), metric: kpiMetric || null,
      target_value: Number(kpiTarget) || 0, current_value: Number(kpiCurrent) || 0,
      unit: kpiUnit || "", period: kpiPeriod, status: kpiStatus,
    });
    if (error) return toast.error(error.message);
    toast.success("KPI added");
    setShowKpi(false); resetKpi(); fetchData();
  };

  const deleteKra = async (id: string) => {
    const { error } = await supabase.from("kras" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("KRA deleted"); fetchData();
  };
  const deleteKpi = async (id: string) => {
    const { error } = await supabase.from("kpis" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("KPI deleted"); fetchData();
  };

  const updateKpiCurrent = async (id: string, value: number) => {
    const { error } = await supabase.from("kpis" as any).update({ current_value: value }).eq("id", id);
    if (error) return toast.error(error.message);
    fetchData();
  };

  const canSeeOthers = accessScope.canViewDeptPerformance;

  const leaderboardProfiles = useMemo(
    () => filterPerformanceLeaderboardProfiles(filterProfiles(allProfiles), rolesByUserId),
    [allProfiles, filterProfiles, rolesByUserId],
  );

  const scopedProfileIds = useMemo(() => {
    if (scope === "me") return user?.id ? [user.id] : [];
    if (scope === "all") return leaderboardProfiles.map((p) => p.id);
    return [scope];
  }, [scope, user?.id, leaderboardProfiles]);

  const { metrics: perfMetrics, loading: perfLoading } = usePerformance(
    scopedProfileIds.length ? scopedProfileIds : undefined,
  );

  const leaderboardMetrics = useMemo(
    () => filterPerformanceMetrics(perfMetrics, rolesByUserId),
    [perfMetrics, rolesByUserId],
  );

  const selectedMetrics = scope === "me"
    ? perfMetrics.find((m) => m.user_id === user?.id)
    : perfMetrics[0];

  return (
    <div className="p-6 max-w-6xl space-y-6">
      <PageHeader
        title="Performance"
        description={
          canSeeOthers
            ? "Track KRAs & KPIs for your team and department"
            : "Your Key Result Areas (KRAs) & Key Performance Indicators (KPIs)"
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
          {canSeeOthers && (
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-9 w-56 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">My KRA & KPI</SelectItem>
                {accessScope.hasFullAccess && <SelectItem value="all">All employees</SelectItem>}
                {accessScope.isManager && !accessScope.hasFullAccess && teamMembers.length > 1 && (
                  <SelectItem value="all">My team</SelectItem>
                )}
                {teamMembers.filter(m => m.id !== user?.id).map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowKra(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add KRA</Button>
          <Button size="sm" onClick={() => setShowKpi(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add KPI</Button>
          </div>
        }
      />
      {accessScope.tier !== "member" && (
        <ScopeBanner scope={accessScope} />
      )}

      <Tabs defaultValue={canSeeOthers ? "analytics" : "kra"}>
        <TabsList>
          <TabsTrigger value="analytics"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Score & Analytics</TabsTrigger>
          <TabsTrigger value="kra"><Target className="h-3.5 w-3.5 mr-1.5" />KRAs ({visibleKras.length})</TabsTrigger>
          <TabsTrigger value="kpi"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />KPIs ({visibleKpis.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="space-y-4 mt-4">
          {accessScope.hasFullAccess && scope === "all" ? (
            <ExecutiveDashboard
              departments={departments}
              profiles={leaderboardProfiles}
              metrics={leaderboardMetrics}
              tasks={tasks}
              workflows={workflows}
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {perfLoading ? (
                <p className="text-sm text-muted-foreground col-span-2">Loading performance data…</p>
              ) : selectedMetrics ? (
                <Card className="md:col-span-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {scope === "me" ? "Your performance" : members.find((m) => m.id === scope)?.name || "Employee"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PerformanceBreakdown
                      metrics={selectedMetrics}
                      showReasons={scope === "me" || accessScope.isManager || accessScope.hasFullAccess}
                    />
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground col-span-2">No performance data yet — complete tasks to build your score.</p>
              )}
              {accessScope.hasFullAccess && scope !== "all" && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Organization summary</CardTitle></CardHeader>
                  <CardContent>
                    <ExecutiveDashboard
                      departments={departments}
                      profiles={leaderboardProfiles}
                      metrics={leaderboardMetrics}
                      tasks={tasks}
                      workflows={workflows}
                      summaryOnly
                    />
                  </CardContent>
                </Card>
              )}
              {canSeeOthers && scope !== "me" && leaderboardMetrics.length > 1 && (
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Team breakdown</CardTitle></CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-4">
                    {leaderboardMetrics.map((m) => {
                      const member = allProfiles.find((p) => p.id === m.user_id);
                      return (
                        <div key={m.user_id} className="border rounded-lg p-3">
                          <p className="text-sm font-medium mb-2">{member?.name || "Unknown"}</p>
                          <PerformanceBreakdown metrics={m} compact showReasons />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="kra" className="space-y-3 mt-4">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : visibleKras.length === 0 ? (
            <div className="border border-dashed rounded-lg p-12 text-center">
              <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No KRAs yet. Add your first Key Result Area.</p>
            </div>
          ) : visibleKras.map(k => {
            const owner = members.find(m => m.id === k.user_id);
            const ownsThis = k.user_id === user?.id;
            return (
              <div key={k.id} className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{k.title}</h3>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[k.status] || ""}`}>{k.status.replace(/_/g, " ")}</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{k.period}</Badge>
                      {k.weight > 0 && <Badge variant="outline" className="text-[10px]">Weight: {k.weight}%</Badge>}
                      {scope !== "me" && owner && (
                        <Badge variant="secondary" className="text-[10px]"><UsersIcon className="h-3 w-3 mr-1" />{owner.name}</Badge>
                      )}
                    </div>
                    {k.description && <p className="text-sm text-muted-foreground mt-1.5">{k.description}</p>}
                    {k.target_date && (
                      <p className="text-xs text-muted-foreground mt-2">Target: {formatDateIST(k.target_date, { day: "numeric", month: "short", year: "numeric" })}</p>
                    )}
                  </div>
                  {ownsThis && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => deleteKra(k.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="kpi" className="space-y-3 mt-4">
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : visibleKpis.length === 0 ? (
            <div className="border border-dashed rounded-lg p-12 text-center">
              <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No KPIs yet. Add your first Key Performance Indicator.</p>
            </div>
          ) : visibleKpis.map(k => {
            const pct = k.target_value > 0 ? Math.min(100, Math.round((k.current_value / k.target_value) * 100)) : 0;
            const owner = members.find(m => m.id === k.user_id);
            const ownsThis = k.user_id === user?.id;
            const linkedKra = kras.find(x => x.id === k.kra_id);
            return (
              <div key={k.id} className="bg-card border rounded-lg p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{k.title}</h3>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[k.status] || ""}`}>{k.status.replace(/_/g, " ")}</Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">{k.period}</Badge>
                      {linkedKra && <Badge variant="outline" className="text-[10px]">KRA: {linkedKra.title}</Badge>}
                      {scope !== "me" && owner && (
                        <Badge variant="secondary" className="text-[10px]"><UsersIcon className="h-3 w-3 mr-1" />{owner.name}</Badge>
                      )}
                    </div>
                    {k.metric && <p className="text-sm text-muted-foreground mt-1.5">{k.metric}</p>}
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-mono-num text-foreground">
                          {k.current_value}{k.unit} / {k.target_value}{k.unit} ({pct}%)
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                      {ownsThis && (
                        <div className="flex items-center gap-2 mt-2">
                          <Label className="text-xs text-muted-foreground">Update current:</Label>
                          <Input
                            type="number"
                            defaultValue={k.current_value}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== k.current_value) updateKpiCurrent(k.id, v);
                            }}
                            className="h-7 w-28 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {ownsThis && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0" onClick={() => deleteKpi(k.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* KRA Dialog */}
      <Dialog open={showKra} onOpenChange={setShowKra}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Key Result Area</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={kraTitle} onChange={e => setKraTitle(e.target.value)} placeholder="e.g. Increase customer retention" /></div>
            <div><Label>Description</Label><Textarea value={kraDesc} onChange={e => setKraDesc(e.target.value)} rows={3} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Weight (%)</Label><Input type="number" value={kraWeight} onChange={e => setKraWeight(e.target.value)} /></div>
              <div><Label>Target Date</Label><Input type="date" value={kraTargetDate} onChange={e => setKraTargetDate(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period</Label>
                <Select value={kraPeriod} onValueChange={setKraPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={kraStatus} onValueChange={setKraStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_track">On Track</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="off_track">Off Track</SelectItem>
                    <SelectItem value="achieved">Achieved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKra(false)}>Cancel</Button>
            <Button onClick={saveKra}>Save KRA</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* KPI Dialog */}
      <Dialog open={showKpi} onOpenChange={setShowKpi}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Key Performance Indicator</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={kpiTitle} onChange={e => setKpiTitle(e.target.value)} placeholder="e.g. Monthly orders processed" /></div>
            <div><Label>Metric description</Label><Input value={kpiMetric} onChange={e => setKpiMetric(e.target.value)} placeholder="What you measure" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Target</Label><Input type="number" value={kpiTarget} onChange={e => setKpiTarget(e.target.value)} /></div>
              <div><Label>Current</Label><Input type="number" value={kpiCurrent} onChange={e => setKpiCurrent(e.target.value)} /></div>
              <div><Label>Unit</Label><Input value={kpiUnit} onChange={e => setKpiUnit(e.target.value)} placeholder="%, ₹, qty" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Period</Label>
                <Select value={kpiPeriod} onValueChange={setKpiPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={kpiStatus} onValueChange={setKpiStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_track">On Track</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="off_track">Off Track</SelectItem>
                    <SelectItem value="achieved">Achieved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Link to KRA (optional)</Label>
              <Select value={kpiKraId} onValueChange={setKpiKraId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {myKras.map(k => <SelectItem key={k.id} value={k.id}>{k.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKpi(false)}>Cancel</Button>
            <Button onClick={saveKpi}>Save KPI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PerformancePage;
