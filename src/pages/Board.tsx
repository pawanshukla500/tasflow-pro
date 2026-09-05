import { useEffect, useMemo, useState } from "react";
import {
  Plus, MoreHorizontal, Calendar, ArrowRight, Trash2, User, Building2,
  Circle, Loader, Eye, CheckCircle2, Ban, LayoutGrid,
} from "lucide-react";
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
import { PageHeader } from "@/components/PageHeader";
import { ProjectBadge } from "@/components/ProjectBadge";
import { useProjects } from "@/hooks/useProjects";
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
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const priorityColors: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const statusLabels = TASK_STATUS_LABELS;

type TaskStatus = "todo" | "in_progress" | "pending_review" | "done" | "blocked";

const columns: {
  status: TaskStatus;
  label: string;
  icon: LucideIcon;
  rail: string;
  tint: string;
  countBg: string;
}[] = [
  {
    status: "todo",
    label: "To Do",
    icon: Circle,
    rail: "bg-muted-foreground/50",
    tint: "from-muted/80 to-muted/20",
    countBg: "bg-muted text-muted-foreground",
  },
  {
    status: "in_progress",
    label: "In Progress",
    icon: Loader,
    rail: "bg-primary",
    tint: "from-primary/[0.08] to-transparent",
    countBg: "bg-primary/12 text-primary",
  },
  {
    status: "pending_review",
    label: "Pending Review",
    icon: Eye,
    rail: "bg-warning",
    tint: "from-warning/[0.08] to-transparent",
    countBg: "bg-warning/15 text-warning",
  },
  {
    status: "done",
    label: "Done",
    icon: CheckCircle2,
    rail: "bg-success",
    tint: "from-success/[0.08] to-transparent",
    countBg: "bg-success/12 text-success",
  },
  {
    status: "blocked",
    label: "Blocked",
    icon: Ban,
    rail: "bg-destructive",
    tint: "from-destructive/[0.08] to-transparent",
    countBg: "bg-destructive/12 text-destructive",
  },
];

const statusColors: Record<string, string> = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  pending_review: "hsl(var(--warning))",
  in_review: "hsl(var(--warning))",
  done: "hsl(var(--success))",
  blocked: "hsl(var(--destructive))",
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
  const [filterProjectId, setFilterProjectId] = useState("all");
  const { projects } = useProjects();

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
    () => {
      const scoped = filterBoardTasks(
        allTasks,
        profiles,
        viewMode === "user" && isLeadership ? filterUserId : null,
        viewMode === "department" && isLeadership ? filterDeptId : null,
      );
      if (filterProjectId === "all") return scoped;
      if (filterProjectId === "none") return scoped.filter((t) => !t.project_id);
      return scoped.filter((t) => t.project_id === filterProjectId);
    },
    [allTasks, profiles, filterBoardTasks, viewMode, isLeadership, filterUserId, filterDeptId, filterProjectId],
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
    // Optimistic: column moves immediately; hook reverts + toasts on API failure.
    const err = await updateTaskStatus(taskId, newStatus);
    if (err) return;
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
    if (err) return;
    toast.success(`Moved to ${statusLabels[newStatus] || newStatus}`);
  };

  const handleDelete = async (task: TaskRow) => {
    if (!canDeleteTask(task, user?.id, isAdminOrMD)) {
      toast.error("Only the task creator or Admin/MD can delete this task");
      return;
    }
    const err = await deleteTask(task.id);
    if (err) return;
    toast.success("Task deleted");
  };

  if (loading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Loading board…</p>
      </div>
    );
  }

  return (
    <div className="relative p-4 md:p-6 space-y-4 h-full flex flex-col page-enter overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 0% 0%, hsl(var(--primary) / 0.09), transparent 55%), radial-gradient(ellipse 40% 50% at 100% 0%, hsl(var(--success) / 0.05), transparent 50%)",
        }}
      />

      <ScopeBanner scope={accessScope} />

      {accessScope.tier === "member" && myPerformance && (
        <div className="card-premium overflow-hidden animate-rise">
          <div className="h-1 w-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
          <div className="px-4 py-3">
            <PerformanceBreakdown metrics={myPerformance} compact showReasons />
          </div>
        </div>
      )}

      <PageHeader
        className="relative mb-0"
        title="Board"
        description={
          accessScope.tier === "member"
            ? "Your tasks only — assigned to you or created by you"
            : isLeadership
              ? "Leadership view — filter by user or department"
              : "Your workspace"
        }
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Select value={filterProjectId} onValueChange={setFilterProjectId}>
              <SelectTrigger className="w-full sm:w-48 h-9 text-xs cursor-pointer bg-background">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.icon} {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
              <span className="font-mono-num font-semibold text-foreground tabular-nums">{tasks.length}</span>
              tasks
            </span>
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={() => { setCreateStatus("todo"); setShowCreate(true); }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />New Task
            </Button>
          </div>
        }
      />

      {isLeadership && accessScope.hasFullAccess && (
        <div className="relative flex flex-col sm:flex-row gap-2.5 items-start sm:items-center rounded-xl border bg-card/80 backdrop-blur-sm px-3 py-2.5 shadow-[0_1px_0_hsl(var(--border)/0.6)] animate-rise [animation-delay:60ms]">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as BoardViewMode)}>
            <TabsList className="h-9 bg-muted/70">
              <TabsTrigger value="user" className="text-xs gap-1.5 cursor-pointer data-[state=active]:shadow-sm">
                <User className="h-3.5 w-3.5" />User-wise
              </TabsTrigger>
              <TabsTrigger value="department" className="text-xs gap-1.5 cursor-pointer data-[state=active]:shadow-sm">
                <Building2 className="h-3.5 w-3.5" />Department
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {viewMode === "user" ? (
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-full sm:w-52 h-9 text-xs cursor-pointer bg-background">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Select value={filterDeptId} onValueChange={setFilterDeptId}>
              <SelectTrigger className="w-full sm:w-52 h-9 text-xs cursor-pointer bg-background">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
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
        <div className="relative animate-rise [animation-delay:60ms]">
          <Select value={filterUserId} onValueChange={setFilterUserId}>
            <SelectTrigger className="w-full sm:w-52 h-9 text-xs cursor-pointer bg-card">
              <SelectValue placeholder="Team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All team members</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0 stagger-children">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) =>
            t.status === col.status || (col.status === "pending_review" && t.status === "in_review"),
          );
          const isOver = dragOverCol === col.status;
          const ColIcon = col.icon;
          return (
            <div
              key={col.status}
              className={cn(
                "w-[280px] md:w-[300px] shrink-0 flex flex-col rounded-2xl border transition-all duration-200 overflow-hidden",
                isOver
                  ? "bg-primary/[0.06] border-primary/35 ring-2 ring-primary/20 ring-inset shadow-md"
                  : "bg-card/70 border-border/70 backdrop-blur-sm",
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={(e) => {
                const t = e.currentTarget;
                const r = e.relatedTarget as HTMLElement;
                if (t.contains(r)) return;
                setDragOverCol(null);
              }}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className={cn("relative bg-gradient-to-b", col.tint)}>
                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", col.rail)} aria-hidden />
                <div className="flex items-center gap-2 pl-4 pr-2 py-3">
                  <div className="icon-chip !w-7 !h-7 !rounded-lg">
                    <ColIcon className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground leading-tight truncate">{col.label}</p>
                  </div>
                  <span className={cn("text-[10px] font-mono-num font-semibold px-2 py-0.5 rounded-md tabular-nums", col.countBg)}>
                    {colTasks.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 cursor-pointer hover:bg-background/80"
                    aria-label={`Add task to ${col.label}`}
                    onClick={() => { setCreateStatus(col.status); setShowCreate(true); }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5 scroll-smooth min-h-[120px]">
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
                      className={cn(
                        "card-premium p-3.5 group relative",
                        allowed.length > 0 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
                        isDragging && "opacity-40 scale-[0.97]",
                        "hover-lift",
                      )}
                    >
                      <div className="flex items-start gap-2 mb-1.5">
                        <p className="flex-1 text-sm font-semibold text-foreground leading-snug line-clamp-2 min-w-0">
                          {task.title}
                        </p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 -mt-0.5 -mr-1 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Task actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {allowed.filter((s) => s !== task.status).length > 0 && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <ArrowRight className="h-3.5 w-3.5 mr-2" />Move to
                                </DropdownMenuSubTrigger>
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

                      <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground capitalize">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }}
                          />
                          {task.priority}
                        </span>
                        {task.requires_review && (
                          <Badge variant="outline" className="text-[9px] h-5 px-1.5 font-medium border-warning/40 text-warning bg-warning/5">
                            Audit
                          </Badge>
                        )}
                        {task.department_name && (
                          <Badge variant="secondary" className="text-[9px] h-5 px-1.5 font-medium">
                            {task.department_name}
                          </Badge>
                        )}
                        {task.project_name && (
                          <ProjectBadge name={task.project_name} color={task.project_color} icon={task.project_icon} />
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                        <div className="flex -space-x-1.5">
                          {task.assignees.slice(0, 3).map((a) => (
                            <div
                              key={a.user_id}
                              title={a.name}
                              className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold border-2 border-card"
                            >
                              {getInitials(a.name)}
                            </div>
                          ))}
                          {task.assignees.length > 3 && (
                            <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-medium border-2 border-card">
                              +{task.assignees.length - 3}
                            </div>
                          )}
                          {task.assignees.length === 0 && (
                            <span className="text-[10px] text-muted-foreground">Unassigned</span>
                          )}
                        </div>
                        {task.due_date && (
                          <div
                            className={cn(
                              "flex items-center gap-1 text-[10px] font-mono-num shrink-0",
                              isOverdue ? "text-destructive font-semibold" : "text-muted-foreground",
                            )}
                          >
                            <Calendar className="h-3 w-3" aria-hidden />
                            {isOverdue ? "Overdue" : "Due"} {formatDateIST(task.due_date)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {colTasks.length === 0 && (
                  <div
                    className={cn(
                      "rounded-xl border-2 border-dashed p-8 text-center transition-colors min-h-[100px] flex flex-col items-center justify-center gap-1.5",
                      isOver ? "border-primary bg-primary/5" : "border-border/60 bg-muted/20",
                    )}
                  >
                    <ColIcon className={cn("h-5 w-5", isOver ? "text-primary" : "text-muted-foreground/50")} aria-hidden />
                    <p className="text-xs text-muted-foreground font-medium">
                      {isOver ? "Drop here" : "No tasks"}
                    </p>
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
