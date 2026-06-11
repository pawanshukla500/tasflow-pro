import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Download, Upload, ChevronDown, ChevronRight, Circle, CheckCircle2,
  MoreHorizontal, Plus, Trash2, ArrowRight, Pencil, User, UserCheck, Building2,
  Clock, ListTodo, AlertTriangle, CalendarClock, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, TaskRow } from "@/hooks/useTasks";
import CreateTaskModal from "@/components/CreateTaskModal";
import EditTaskModal from "@/components/EditTaskModal";
import ImportTasksModal from "@/components/ImportTasksModal";
import CompleteTaskDialog from "@/components/CompleteTaskDialog";
import TaskReviewDialog from "@/components/TaskReviewDialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { todayIST, formatDateIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  allowedStatusesForUser,
  canApproveOrRejectReview,
  canDeleteTask,
  canEditTaskMetadata,
  canSubmitForReview,
  TASK_STATUS_LABELS,
} from "@/lib/taskPermissions";

const priorityColors: Record<string, string> = {
  critical: "#dc2626",
  high: "#f59e0b",
  medium: "#6366f1",
  low: "#22c55e",
};

const statusLabels = TASK_STATUS_LABELS;

const statusColors: Record<string, string> = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  pending_review: "hsl(38,92%,50%)",
  in_review: "hsl(38,92%,50%)",
  done: "hsl(142,71%,45%)",
  blocked: "hsl(0,72%,51%)",
};

const MyTasks = () => {
  const [searchParams] = useSearchParams();
  const { tasks, loading, fetchTasks, updateTaskStatus, deleteTask } = useTasks();
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("assigned_to_me");
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [completingTask, setCompletingTask] = useState<TaskRow | null>(null);
  const [reviewTask, setReviewTask] = useState<{ task: TaskRow; mode: "submit" | "approve" | "reject" } | null>(null);
  const { user, isAdminOrMD, isDeptManager, accessScope, managedDepartments } = useAuth();
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [filterableUsers, setFilterableUsers] = useState<{ id: string; name: string }[]>([]);
  const canFilterByUser = isAdminOrMD || isDeptManager;

  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId || loading) return;
    const t = tasks.find((x) => x.id === taskId);
    if (t) {
      setHighlightTaskId(taskId);
      setEditingTask(t);
      setTimeout(() => setHighlightTaskId(null), 4000);
    }
  }, [searchParams, tasks, loading]);

  useEffect(() => {
    if (!canFilterByUser || !user) return;
    (async () => {
      let q = supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name");
      if (!isAdminOrMD && isDeptManager) {
        const depts = user.managedDepartments || [];
        if (depts.length === 0) { setFilterableUsers([]); return; }
        q = q.in("department_id", depts);
      }
      const { data } = await q;
      setFilterableUsers((data || []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    })();
  }, [canFilterByUser, isAdminOrMD, isDeptManager, user?.id]);

  const today = todayIST();
  const isAssignedToMe = (t: TaskRow) => !!user && t.assignees.some((a) => a.user_id === user.id);
  const isAssignedByMe = (t: TaskRow) => !!user && t.created_by === user.id;
  const isUnassigned = (t: TaskRow) => t.assignees.length === 0;

  const filtered = tasks.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === "assigned_to_me" && !isAssignedToMe(t)) return false;
    if (activeTab === "assigned_by_me" && !isAssignedByMe(t)) return false;
    if (activeTab === "unassigned" && !isUnassigned(t)) return false;
    if (canFilterByUser && userFilter !== "all") {
      if (!t.assignees.some((a) => a.user_id === userFilter) && t.created_by !== userFilter) return false;
    }
    return true;
  });

  const overdue = filtered.filter((t) => t.due_date && t.due_date < today && t.status !== "done");
  const dueToday = filtered.filter((t) => t.due_date === today && t.status !== "done");
  const upcoming = filtered.filter((t) => (!t.due_date || t.due_date > today) && t.status !== "done");
  const completed = filtered.filter((t) => t.status === "done");
  const activeCount = overdue.length + dueToday.length + upcoming.length;

  const tabs = [
    { id: "assigned_to_me", label: "Assigned to me", count: tasks.filter(isAssignedToMe).length, icon: User },
    { id: "assigned_by_me", label: "Assigned by me", count: tasks.filter(isAssignedByMe).length, icon: ArrowRight },
    { id: "unassigned", label: "Unassigned", count: tasks.filter(isUnassigned).length, icon: Inbox },
    { id: "all", label: "All tasks", count: tasks.length, icon: ListTodo },
  ];

  const sections = [
    { title: "Overdue", tasks: overdue, color: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/5", icon: AlertTriangle, id: "overdue" },
    { title: "Due Today", tasks: dueToday, color: "text-warning", border: "border-warning/30", bg: "bg-warning/5", icon: CalendarClock, id: "today" },
    { title: "Upcoming", tasks: upcoming, color: "text-primary", border: "border-primary/20", bg: "bg-primary/5", icon: Clock, id: "upcoming" },
    { title: "Completed", tasks: completed, color: "text-success", border: "border-success/20", bg: "bg-success/5", icon: CheckCircle2, id: "completed" },
  ];

  const kpis = [
    { label: "Overdue", value: overdue.length, tone: "text-destructive", bg: "from-destructive/15 to-destructive/5" },
    { label: "Due Today", value: dueToday.length, tone: "text-warning", bg: "from-warning/15 to-warning/5" },
    { label: "Active", value: activeCount, tone: "text-primary", bg: "from-primary/15 to-primary/5" },
    { label: "Done", value: completed.length, tone: "text-success", bg: "from-success/15 to-success/5" },
  ];

  const toggle = (id: string) =>
    setCollapsedSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleStatusChange = async (task: TaskRow, newStatus: string) => {
    if (newStatus === "done" && task.requires_review && !canEditTaskMetadata(task, user?.id, isAdminOrMD)) {
      setReviewTask({ task, mode: "submit" });
      return;
    }
    const err = await updateTaskStatus(task.id, newStatus);
    if (err) toast.error(err.message || "Failed to update status");
    else toast.success(`Status updated to ${statusLabels[newStatus] || newStatus}`);
  };

  const handleCompleteClick = (task: TaskRow) => {
    if (task.status === "done") {
      handleStatusChange(task, "todo");
      return;
    }
    if (task.requires_review && isAssignedToMe(task) && !canEditTaskMetadata(task, user?.id, isAdminOrMD)) {
      setReviewTask({ task, mode: "submit" });
      return;
    }
    if (task.assignees.length > 1 && user && task.assignees.some((a) => a.user_id === user.id)) {
      setCompletingTask(task);
      return;
    }
    handleStatusChange(task, "done");
  };

  const handleDelete = async (taskId: string) => {
    const err = await deleteTask(taskId);
    if (err) toast.error("Failed to delete task");
    else toast.success("Task deleted");
  };

  const handleExport = () => {
    const csv = [
      ["Title", "Status", "Priority", "Due Date", "Department"].join(","),
      ...tasks.map((t) =>
        [`"${t.title}"`, statusLabels[t.status] || t.status, t.priority, t.due_date || "", t.department_name || ""].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tasks.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const TaskCard = ({ task }: { task: TaskRow }) => {
    const isOverdue = task.due_date && task.due_date < today && task.status !== "done";
    const isDueToday = task.due_date === today && task.status !== "done";
    const firstAssignee = task.assignees[0];
    const canDelete = canDeleteTask(task, user?.id, isAdminOrMD);
    const canEdit = canEditTaskMetadata(task, user?.id, isAdminOrMD);
    const allowedStatuses = allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || []);
    const showSubmitReview = canSubmitForReview(task, user?.id);
    const showReviewActions = canApproveOrRejectReview(task, user?.id, isAdminOrMD, managedDepartments || []);

    return (
      <div
        id={`task-${task.id}`}
        className={cn(
          "flex items-center gap-3 px-3.5 py-3 rounded-xl border bg-card/80 hover:bg-muted/40 hover:border-primary/20 transition-all group",
          highlightTaskId === task.id && "ring-2 ring-primary/40 bg-primary/5",
        )}
      >
        <button
          className="text-muted-foreground hover:text-success transition-colors shrink-0"
          onClick={() => handleCompleteClick(task)}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            className="block w-full text-sm font-medium text-foreground text-left hover:text-primary transition-colors truncate"
            onClick={() => setEditingTask(task)}
          >
            {task.title}
          </button>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-muted-foreground">
            {firstAssignee ? (
              <span className="inline-flex items-center gap-1 min-w-0">
                <User className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate">{firstAssignee.name}{task.assignees.length > 1 && ` +${task.assignees.length - 1}`}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3 opacity-60" />Unassigned</span>
            )}
            {task.creator_name && task.creator_name !== firstAssignee?.name && (
              <span className="inline-flex items-center gap-1 min-w-0">
                <span className="opacity-30">·</span>
                <UserCheck className="h-3 w-3 shrink-0 opacity-60" />
                <span className="truncate">{task.creator_name}</span>
              </span>
            )}
            {/* Compact meta — mobile only; desktop shows the right-side columns */}
            <span className="sm:hidden inline-flex items-center gap-2">
              <span className="opacity-30">·</span>
              <span className="inline-flex items-center gap-1 capitalize">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: priorityColors[task.priority] }} />
                {task.priority}
              </span>
              {task.due_date && (
                <span className={cn(
                  "font-mono-num",
                  isOverdue ? "text-destructive font-semibold" : isDueToday ? "text-warning font-medium" : "",
                )}>
                  {formatDateIST(task.due_date, { day: "numeric", month: "short" })}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Right-aligned meta columns (desktop) */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          {task.department_name && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1 max-w-[140px]">
              <Building2 className="h-3 w-3 shrink-0 opacity-60" />
              <span className="truncate">{task.department_name}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground capitalize w-16">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: priorityColors[task.priority] }} />
            {task.priority}
          </span>
          <span className={cn(
            "text-[11px] font-mono-num w-16 text-right",
            isOverdue ? "text-destructive font-semibold" : isDueToday ? "text-warning font-medium" : "text-muted-foreground",
          )}>
            {task.due_date ? (
              <>
                {formatDateIST(task.due_date, { day: "numeric", month: "short" })}
                {isOverdue && " ⚠"}
              </>
            ) : "—"}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] border-0 px-2 w-[76px] justify-center"
            style={{ color: statusColors[task.status], background: `${statusColors[task.status]}14` }}
          >
            {statusLabels[task.status]}
          </Badge>
          <div className="flex -space-x-1.5 w-[44px] justify-end">
            {task.assignees.slice(0, 2).map((a) => (
              <div key={a.user_id} className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-[9px] font-bold border-2 border-card" title={a.name}>
                {getInitials(a.name)}
              </div>
            ))}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingTask(task)}>
              <Pencil className="h-3.5 w-3.5 mr-2" />{canEdit ? "Edit" : "View"}
            </DropdownMenuItem>
            {showSubmitReview && (
              <DropdownMenuItem onClick={() => setReviewTask({ task, mode: "submit" })}>
                Submit for Review
              </DropdownMenuItem>
            )}
            {showReviewActions && (
              <>
                <DropdownMenuItem onClick={() => setReviewTask({ task, mode: "approve" })}>
                  Approve Task
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setReviewTask({ task, mode: "reject" })}>
                  Reject Task
                </DropdownMenuItem>
              </>
            )}
            {allowedStatuses.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowRight className="h-3.5 w-3.5 mr-2" />Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {allowedStatuses.filter((s) => s !== task.status).map((s) => (
                    <DropdownMenuItem key={s} onClick={() => handleStatusChange(task, s)}>
                      {statusLabels[s] || s}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(task.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Loading your tasks…</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto page-enter space-y-5">
      <PageHeader
        title="My Tasks"
        description={`${activeCount} active · ${completed.length} completed`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="h-3.5 w-3.5 mr-1" />Import
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-3.5 w-3.5 mr-1" />Export
            </Button>
            {accessScope.canCreateTasks && (
              <Button size="sm" className="shadow-md shadow-primary/20" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />New Task
              </Button>
            )}
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className={cn("card-premium p-3.5 bg-gradient-to-br", k.bg)}>
            <p className={cn("text-2xl font-mono-num font-bold leading-none", k.tone)}>{k.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5 font-semibold">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-9 rounded-xl bg-muted/30 border-border/60"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canFilterByUser && (
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs rounded-xl">
              <SelectValue placeholder="Team member…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isAdminOrMD ? "All team members" : "My team"}</SelectItem>
              {filterableUsers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-muted/40 rounded-xl p-1 border w-fit flex-wrap">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all press-scale",
                isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className="font-mono-num text-[10px] opacity-70">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Task sections */}
      <div className="space-y-4">
        {sections.every((s) => s.tasks.length === 0) ? (
          <div className="card-premium border-dashed">
            <EmptyState
              icon={ListTodo}
              title="No tasks in this view"
              description={
                activeTab === "assigned_to_me"
                  ? "Tasks assigned to you will appear here. Create one or ask your team lead to assign work."
                  : "Create a task to get started, or switch filters to see other tasks."
              }
              action={
                accessScope.canCreateTasks
                  ? { label: "+ Create your first task", onClick: () => setShowCreate(true) }
                  : undefined
              }
            />
          </div>
        ) : (
          sections
            .filter((s) => s.tasks.length > 0)
            .map((section) => {
              const isCollapsed = collapsedSections.includes(section.id);
              const Icon = section.icon;
              return (
                <div key={section.id} className={cn("rounded-xl border overflow-hidden", section.border, section.bg)}>
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-background/40 transition-colors"
                    onClick={() => toggle(section.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <Icon className={cn("h-4 w-4", section.color)} />
                      <span className={cn("text-sm font-semibold", section.color)}>{section.title}</span>
                      <Badge variant="secondary" className="text-[10px] h-5 font-mono-num">{section.tasks.length}</Badge>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="px-3 pb-3 space-y-2">
                      {section.tasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
        )}
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={fetchTasks} />}
      {showImport && <ImportTasksModal onClose={() => setShowImport(false)} onImported={fetchTasks} />}
      {editingTask && <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} onSaved={fetchTasks} />}
      {completingTask && (
        <CompleteTaskDialog
          open={!!completingTask}
          onOpenChange={(o) => { if (!o) setCompletingTask(null); }}
          task={completingTask}
          onDone={fetchTasks}
        />
      )}
      {reviewTask && (
        <TaskReviewDialog
          open={!!reviewTask}
          onOpenChange={(o) => { if (!o) setReviewTask(null); }}
          task={reviewTask.task}
          mode={reviewTask.mode}
          onDone={fetchTasks}
        />
      )}
    </div>
  );
};

export default MyTasks;
