import { useEffect, useMemo, useState } from "react";
import { Plus, MoreHorizontal, Calendar, ArrowRight, Trash2, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useTasks, TaskRow } from "@/hooks/useTasks";
import CreateTaskModal from "@/components/CreateTaskModal";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { ScopeBanner } from "@/components/ScopeBanner";
import {
  allowedStatusesForUser,
  canDeleteTask,
  TASK_STATUS_LABELS,
} from "@/lib/taskPermissions";
import { toast } from "sonner";
import { todayIST, formatDateIST } from "@/lib/time";
import { supabase } from "@/integrations/supabase/client";
import { usePerformance } from "@/hooks/usePerformance";
import { PerformanceBreakdown } from "@/components/PerformanceBreakdown";
import { Card, CardContent } from "@/components/ui/card";

const priorityColors: Record<string, string> = {
  critical: "hsl(0,72%,51%)", high: "hsl(38,92%,50%)", medium: "hsl(239,84%,67%)", low: "hsl(142,71%,45%)",
};

const statusLabels = TASK_STATUS_LABELS;

type TaskStatus = "todo" | "in_progress" | "pending_review" | "done" | "blocked";

const columns: { status: TaskStatus; label: string; emoji: string }[] = [
  { status: "todo", label: "To Do", emoji: "📋" },
  { status: "in_progress", label: "In Progress", emoji: "🔄" },
  { status: "pending_review", label: "Pending Review", emoji: "👀" },
  { status: "done", label: "Done", emoji: "✅" },
  { status: "blocked", label: "Blocked", emoji: "🚫" },
];

const statusColors: Record<string, string> = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  pending_review: "hsl(38,92%,50%)",
  in_review: "hsl(38,92%,50%)",
  done: "hsl(142,71%,45%)",
  blocked: "hsl(0,72%,51%)",
};

type BoardViewMode = "user" | "department";

const Board = () => {
  const { tasks: allTasks, loading, fetchTasks, updateTaskStatus, deleteTask } = useTasks();
  const { user, isAdminOrMD, managedDepartments, accessScope } = useAuth();
  const { filterBoardTasks, filterDepartments, filterProfiles } = useAccessScope();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TaskStatus | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState<string>("todo");
  const [profiles, setProfiles] = useState<{ id: string; name: string; department_id?: string | null }[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = useState<BoardViewMode>("user");
  const [filterUserId, setFilterUserId] = useState("all");
  const [filterDeptId, setFilterDeptId] = useState("all");

  const isLeadership = accessScope.hasFullAccess || accessScope.isManager || accessScope.isHR;
  const { metrics: myPerfMetrics } = usePerformance(user?.id ? [user.id] : undefined);
  const myPerformance = myPerfMetrics[0];

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name"),
      supabase.from("departments").select("id, name").order("name"),
    ]).then(([pRes, dRes]) => {
      setProfiles(filterProfiles(pRes.data || []));
      setDepartments(filterDepartments(dRes.data || []));
    });
  }, [user, filterProfiles, filterDepartments]);

  const tasks = useMemo(
    () =>
      filterBoardTasks(
        allTasks,
        profiles,
        viewMode === "user" && isLeadership ? filterUserId : null,
        viewMode === "department" && isLeadership ? filterDeptId : null,
      ),
    [allTasks, profiles, filterBoardTasks, viewMode, isLeadership, filterUserId, filterDeptId],
  );

  const today = todayIST();
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const getTask = (id: string) => tasks.find((t) => t.id === id);

  const canMoveToStatus = (task: TaskRow, newStatus: string) =>
    allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || []).includes(newStatus);

  const handleDragStart = (e: React.DragEvent, task: TaskRow) => {
    setDraggedTaskId(task.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    requestAnimationFrame(() => {
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "0.4";
    });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.style.opacity = "1";
    setDraggedTaskId(null);
    setDragOverCol(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    if (!taskId) return;
    const task = getTask(taskId);
    if (!task) return;
    setDragOverCol(null);
    if (!canMoveToStatus(task, newStatus)) {
      toast.error("You are not allowed to move this task to that status");
      return;
    }
    if (newStatus === "done" && task.due_date && task.due_date < today) {
      toast.info("Late completion will be recorded and may affect performance score.");
    }
    const err = await updateTaskStatus(taskId, newStatus);
    if (err) toast.error(err.message || "Failed to move task");
  };

  const handleStatusChange = async (task: TaskRow, newStatus: string) => {
    if (!canMoveToStatus(task, newStatus)) {
      toast.error("You are not allowed to move this task to that status");
      return;
    }
    if (newStatus === "done" && task.due_date && task.due_date < today) {
      toast.info("Late completion recorded — performance score updated.");
    }
    const err = await updateTaskStatus(task.id, newStatus);
    if (err) toast.error(err.message || "Failed to update status");
    else toast.success(`Moved to ${statusLabels[newStatus] || newStatus}`);
  };

  const handleDelete = async (task: TaskRow) => {
    if (!canDeleteTask(task, user?.id, isAdminOrMD)) {
      toast.error("Only the task creator or Admin/MD can delete this task");
      return;
    }
    const err = await deleteTask(task.id);
    if (err) toast.error(err.message || "Failed to delete task");
    else toast.success("Task deleted");
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading board…</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col">
      <ScopeBanner scope={accessScope} />

      {accessScope.tier === "member" && myPerformance && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-3">
            <PerformanceBreakdown metrics={myPerformance} compact showReasons />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Board</h1>
          <p className="text-xs text-muted-foreground">
            {accessScope.tier === "member"
              ? "Your tasks only — assigned to you or created by you"
              : isLeadership
                ? "Leadership view — filter by user or department"
                : "Your workspace"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono-num">{tasks.length} tasks</span>
          <Button size="sm" onClick={() => { setCreateStatus("todo"); setShowCreate(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" />New Task
          </Button>
        </div>
      </div>

      {isLeadership && accessScope.hasFullAccess && (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as BoardViewMode)}>
            <TabsList>
              <TabsTrigger value="user" className="text-xs gap-1"><User className="h-3.5 w-3.5" />User-wise</TabsTrigger>
              <TabsTrigger value="department" className="text-xs gap-1"><Building2 className="h-3.5 w-3.5" />Department</TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "user" ? (
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={filterDeptId} onValueChange={setFilterDeptId}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {isLeadership && !accessScope.hasFullAccess && (
        <Select value={filterUserId} onValueChange={setFilterUserId}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Team member" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All team members</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) =>
            t.status === col.status || (col.status === "pending_review" && t.status === "in_review"),
          );
          const isOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              className={`w-[280px] md:w-[300px] shrink-0 flex flex-col rounded-xl transition-all duration-200 ${isOver ? "bg-primary/5 ring-2 ring-primary/20 ring-inset" : "bg-muted/30"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={(e) => { const t = e.currentTarget; const r = e.relatedTarget as HTMLElement; if (t.contains(r)) return; setDragOverCol(null); }}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className="flex items-center gap-2 p-3 pb-2">
                <span className="text-sm">{col.emoji}</span>
                <span className="text-sm font-semibold text-foreground">{col.label}</span>
                <span className="text-[10px] font-mono-num bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6 ml-auto hover:bg-card"
                  onClick={() => { setCreateStatus(col.status); setShowCreate(true); }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 scroll-smooth">
                {colTasks.map((task) => {
                  const isDragging = draggedTaskId === task.id;
                  const isOverdue = task.due_date && task.due_date < today && task.status !== "done";
                  const allowed = allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || []);
                  const canDelete = canDeleteTask(task, user?.id, isAdminOrMD);
                  return (
                    <div
                      key={task.id}
                      draggable={allowed.length > 0}
                      onDragStart={(e) => handleDragStart(e, task)}
                      onDragEnd={handleDragEnd}
                      className={`bg-card rounded-xl border shadow-sm hover:shadow-lg transition-all duration-200 p-3.5 ${allowed.length > 0 ? "cursor-grab active:cursor-grabbing" : "cursor-default"} group ${isDragging ? "opacity-40 scale-95" : "hover:-translate-y-0.5"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }} />
                        <span className="text-[10px] font-medium text-muted-foreground capitalize">{task.priority}</span>
                        {task.requires_review && (
                          <Badge variant="outline" className="text-[8px] h-4 px-1 ml-1">Audit</Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {allowed.filter((s) => s !== task.status).length > 0 && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger><ArrowRight className="h-3.5 w-3.5 mr-2" />Move to</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {allowed.filter((s) => s !== task.status).map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => handleStatusChange(task, s)}>
                                      <div className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: statusColors[s] }} />
                                      {statusLabels[s] || s}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(task)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <p className="text-sm font-medium text-foreground leading-snug mb-2 line-clamp-2">{task.title}</p>
                      {task.department_name && <Badge variant="secondary" className="text-[9px] mb-2">{task.department_name}</Badge>}

                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                        <div className="flex -space-x-1.5">
                          {task.assignees.slice(0, 2).map((a) => (
                            <div key={a.user_id} className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[8px] font-bold border-2 border-card">
                              {getInitials(a.name)}
                            </div>
                          ))}
                          {task.assignees.length > 2 && (
                            <div className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-medium border-2 border-card">+{task.assignees.length - 2}</div>
                          )}
                        </div>
                      </div>
                      {task.due_date && (
                        <div className={`flex items-center gap-1 mt-1.5 text-[10px] ${isOverdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          <Calendar className="h-2.5 w-2.5" />
                          {isOverdue ? "Overdue" : "Due"} {formatDateIST(task.due_date)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border/50"}`}>
                    <p className="text-xs text-muted-foreground">{isOver ? "Drop here" : "No tasks"}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={fetchTasks} initialStatus={createStatus} />}
    </div>
  );
};

export default Board;
