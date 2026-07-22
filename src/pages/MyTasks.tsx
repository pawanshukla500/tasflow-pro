import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search, Download, Upload, ChevronDown, ChevronRight, Circle, CheckCircle2,
  MoreHorizontal, Plus, Trash2, ArrowRight, Pencil, User,
  Clock, ListTodo, AlertTriangle, CalendarClock, Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTasks, TaskRow } from "@/hooks/useTasks";
import CreateTaskModal from "@/components/CreateTaskModal";
import EditTaskModal from "@/components/EditTaskModal";
import CompleteTaskDialog from "@/components/CompleteTaskDialog";
import TaskReviewDialog from "@/components/TaskReviewDialog";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
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
import {
  filterMyTasksView,
  myTasksTabCounts,
  resolveSubjectUserId,
  type MyTasksTab,
} from "@/lib/myTasksView";

const ImportTasksModal = lazy(() => import("@/components/ImportTasksModal"));

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
  const { tasks, loading, loadingMore, fetchTasks, updateTaskStatus, deleteTask, hasMore, loadMore, total } = useTasks();
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MyTasksTab>("assigned_to_me");
  const [collapsedSections, setCollapsedSections] = useState<string[]>(["completed"]);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [completingTask, setCompletingTask] = useState<TaskRow | null>(null);
  const [reviewTask, setReviewTask] = useState<{ task: TaskRow; mode: "submit" | "approve" | "reject" } | null>(null);
  const { user, isAdminOrMD, isDeptManager, isHR, accessScope, managedDepartments } = useAuth();
  const { filterTasks } = useAccessScope();
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [filterableUsers, setFilterableUsers] = useState<{ id: string; name: string; department_id?: string | null }[]>([]);
  const canFilterByUser = isAdminOrMD || isDeptManager;

  const subjectUserId = resolveSubjectUserId(user?.id, canFilterByUser, userFilter);
  const selectedMemberName = filterableUsers.find((member) => member.id === userFilter)?.name;

  const visibleTasks = useMemo(
    () => (canFilterByUser ? filterTasks(tasks, filterableUsers) : tasks),
    [tasks, filterableUsers, canFilterByUser, filterTasks],
  );

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
        const depts = user.managedDepartments?.length
          ? user.managedDepartments
          : user.profile?.department_id
            ? [user.profile.department_id]
            : [];
        if (depts.length === 0) { setFilterableUsers([]); return; }
        q = q.in("department_id", depts);
      }
      const { data } = await q;
      setFilterableUsers((data || []).map((p: { id: string; name: string; department_id?: string | null }) => ({
        id: p.id,
        name: p.name,
        department_id: p.department_id,
      })));
    })();
  }, [canFilterByUser, isAdminOrMD, isDeptManager, user?.id]);

  useEffect(() => {
    if (canFilterByUser && userFilter !== "all") {
      setActiveTab("assigned_to_me");
    }
  }, [userFilter, canFilterByUser]);

  const today = todayIST();
  const isAssignedToMe = (t: TaskRow) => !!user && t.assignees.some((a) => a.user_id === user.id);

  const filtered = filterMyTasksView(visibleTasks, {
    activeTab,
    search,
    subjectUserId,
    canFilterByUser,
    userFilter,
  });

  const tabCounts = myTasksTabCounts(visibleTasks, subjectUserId, { canFilterByUser, userFilter });

  const overdue = filtered.filter((t) => t.due_date && t.due_date < today && t.status !== "done");
  const dueToday = filtered.filter((t) => t.due_date === today && t.status !== "done");
  const upcoming = filtered.filter((t) => (!t.due_date || t.due_date > today) && t.status !== "done");
  const completed = filtered.filter((t) => t.status === "done");
  const activeCount = overdue.length + dueToday.length + upcoming.length;

  const tabs = [
    {
      id: "assigned_to_me" as const,
      label: userFilter !== "all" && canFilterByUser && selectedMemberName
        ? `Assigned to ${selectedMemberName}`
        : "Assigned to me",
      count: tabCounts.assigned_to_me,
      icon: User,
    },
    {
      id: "assigned_by_me" as const,
      label: userFilter !== "all" && canFilterByUser && selectedMemberName
        ? `Assigned by ${selectedMemberName}`
        : "Assigned by me",
      count: tabCounts.assigned_by_me,
      icon: ArrowRight,
    },
    { id: "unassigned" as const, label: "Unassigned", count: tabCounts.unassigned, icon: Inbox },
    { id: "all" as const, label: "All tasks", count: tabCounts.all, icon: ListTodo },
  ];

  const sections = [
    { title: "Overdue", tasks: overdue, color: "text-destructive", accent: "border-l-destructive", icon: AlertTriangle, id: "overdue" },
    { title: "Due Today", tasks: dueToday, color: "text-warning", accent: "border-l-warning", icon: CalendarClock, id: "today" },
    { title: "Upcoming", tasks: upcoming, color: "text-primary", accent: "border-l-primary", icon: Clock, id: "upcoming" },
    { title: "Completed", tasks: completed, color: "text-success", accent: "border-l-success", icon: CheckCircle2, id: "completed" },
  ];

  const kpis = [
    { label: "Overdue", value: overdue.length, tone: "text-destructive" },
    { label: "Due today", value: dueToday.length, tone: "text-warning" },
    { label: "Active", value: activeCount, tone: "text-primary" },
    { label: "Done", value: completed.length, tone: "text-success" },
  ];

  const toggle = (id: string) =>
    setCollapsedSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const handleStatusChange = async (task: TaskRow, newStatus: string) => {
    if (newStatus === "done" && task.requires_review && !canEditTaskMetadata(task, user?.id, isAdminOrMD, { isHR, managedDepartments: managedDepartments || [] })) {
      setReviewTask({ task, mode: "submit" });
      return;
    }
    // Optimistic: list updates immediately; hook reverts + toasts on API failure.
    const err = await updateTaskStatus(task.id, newStatus);
    if (err) return;
    toast.success(`Status updated to ${statusLabels[newStatus] || newStatus}`);
  };

  const handleCompleteClick = (task: TaskRow) => {
    if (task.status === "done") {
      handleStatusChange(task, "todo");
      return;
    }
    if (task.requires_review && isAssignedToMe(task) && !canEditTaskMetadata(task, user?.id, isAdminOrMD, { isHR, managedDepartments: managedDepartments || [] })) {
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
    if (err) return;
    toast.success("Task deleted");
  };

  const handleExport = () => {
    const csv = [
      ["Title", "Status", "Priority", "Due Date", "Department"].join(","),
      ...filtered.map((t) =>
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
    const canEdit = canEditTaskMetadata(task, user?.id, isAdminOrMD, { isHR, managedDepartments: managedDepartments || [] });
    const allowedStatuses = allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || [], { isHR });
    const showSubmitReview = canSubmitForReview(task, user?.id);
    const showReviewActions = canApproveOrRejectReview(task, user?.id, isAdminOrMD, managedDepartments || []);

    return (
      <div
        id={`task-${task.id}`}
        className={cn(
          "flex items-center gap-2.5 px-2.5 sm:px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors group",
          highlightTaskId === task.id && "bg-primary/5 ring-1 ring-primary/30",
        )}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-success transition-colors shrink-0 p-0.5"
          onClick={() => handleCompleteClick(task)}
          aria-label={task.status === "done" ? "Mark incomplete" : "Mark complete"}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="h-4.5 w-4.5 h-[18px] w-[18px] text-success" />
          ) : (
            <Circle className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            className={cn(
              "block w-full text-sm text-left truncate transition-colors hover:text-primary",
              task.status === "done" ? "text-muted-foreground line-through decoration-muted-foreground/40" : "font-medium text-foreground",
            )}
            onClick={() => setEditingTask(task)}
          >
            {task.title}
          </button>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
            {firstAssignee ? (
              <span className="truncate max-w-[140px]">{firstAssignee.name}{task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}</span>
            ) : (
              <span>Unassigned</span>
            )}
            {task.department_name && (
              <>
                <span className="opacity-30">·</span>
                <span className="truncate max-w-[120px]">{task.department_name}</span>
              </>
            )}
            <span className="sm:hidden inline-flex items-center gap-1.5">
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

        <div className="hidden sm:flex items-center gap-2.5 shrink-0 text-[11px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground capitalize w-14">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: priorityColors[task.priority] }} />
            {task.priority}
          </span>
          <span className={cn(
            "font-mono-num w-14 text-right",
            isOverdue ? "text-destructive font-semibold" : isDueToday ? "text-warning font-medium" : "text-muted-foreground",
          )}>
            {task.due_date ? formatDateIST(task.due_date, { day: "numeric", month: "short" }) : "—"}
          </span>
          <span
            className="w-[72px] text-center font-medium"
            style={{ color: statusColors[task.status] }}
          >
            {statusLabels[task.status]}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
            >
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto page-enter space-y-4">
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
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />New Task
              </Button>
            )}
          </>
        }
      />

      {/* Compact KPI strip — one row, no heavy cards */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm border-b border-border/60 pb-3">
        {kpis.map((k, i) => (
          <div key={k.label} className="inline-flex items-baseline gap-1.5">
            {i > 0 && <span className="text-border mr-2 hidden sm:inline">|</span>}
            <span className={cn("font-mono-num font-semibold tabular-nums", k.tone)}>{k.value}</span>
            <span className="text-xs text-muted-foreground">{k.label}</span>
          </div>
        ))}
      </div>

      {/* Search + member filter + view tabs */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {canFilterByUser && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs">
                <SelectValue placeholder="Team member…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAdminOrMD ? "All team members" : "My team"}</SelectItem>
                {user?.id && (
                  <SelectItem value={user.id}>Me</SelectItem>
                )}
                {filterableUsers
                  .filter((member) => member.id !== user?.id)
                  .map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                <span className="font-mono-num text-[10px] opacity-70">{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Task sections */}
      <div className="space-y-3">
        {sections.every((s) => s.tasks.length === 0) ? (
          <div className="rounded-xl border border-dashed">
            <EmptyState
              icon={ListTodo}
              title="No tasks in this view"
              description={
                activeTab === "assigned_to_me"
                  ? userFilter !== "all" && canFilterByUser
                    ? `No tasks assigned to ${selectedMemberName || "this team member"} yet.`
                    : "Tasks assigned to you will appear here. Create one or ask your team lead to assign work."
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
                <section
                  key={section.id}
                  className={cn("rounded-lg border border-border/70 border-l-4 bg-card overflow-hidden", section.accent)}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
                    onClick={() => toggle(section.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Icon className={cn("h-3.5 w-3.5", section.color)} />
                      <span className={cn("text-xs font-semibold uppercase tracking-wide", section.color)}>
                        {section.title}
                      </span>
                      <span className="font-mono-num text-[11px] text-muted-foreground">{section.tasks.length}</span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="border-t border-border/50 divide-y divide-border/40">
                      {section.tasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
        )}
      </div>

      {hasMore && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Showing {tasks.length}
            {typeof total === "number" ? ` of ${total}` : ""} tasks
          </p>
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loading || loadingMore}>
            {loadingMore ? "Loading…" : "Load more tasks"}
          </Button>
        </div>
      )}

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={fetchTasks} />}
      {showImport && (
        <Suspense fallback={null}>
          <ImportTasksModal onClose={() => setShowImport(false)} onImported={fetchTasks} />
        </Suspense>
      )}
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
