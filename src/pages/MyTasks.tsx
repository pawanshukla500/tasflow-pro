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
import { useAuth } from "@/contexts/AuthContext";
import { useAccessScope } from "@/hooks/useAccessScope";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { todayIST, formatDateIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/projectBudget";
import {
  TASK_IMPORT_HEADERS,
  taskToExportRow,
  toCsv,
} from "@/lib/taskImport";
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

const TAB_CLASS =
  "rounded-none border-b-2 bg-transparent px-3 pb-2 pt-1.5 text-[13px] font-medium shadow-none inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer";

const priorityColors: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const statusLabels = TASK_STATUS_LABELS;

const statusColors: Record<string, string> = {
  todo: "hsl(var(--muted-foreground))",
  in_progress: "hsl(var(--primary))",
  pending_review: "hsl(var(--warning))",
  in_review: "hsl(var(--warning))",
  done: "hsl(var(--success))",
  blocked: "hsl(var(--destructive))",
};

function hoursMeta(task: TaskRow): string | null {
  const estimated = formatHours(task.estimated_hours);
  const logged = formatHours(task.logged_hours);
  if (estimated && logged) return `${estimated} / ${logged}`;
  return estimated || logged;
}

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
  const canCreate = accessScope.canCreateTasks;

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
  }, [canFilterByUser, isAdminOrMD, isDeptManager, user]);

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
    { id: "all" as const, label: "All", count: tabCounts.all, icon: ListTodo },
  ];

  const sections = [
    { title: "Overdue", tasks: overdue, color: "text-destructive", accent: "border-l-destructive", icon: AlertTriangle, id: "overdue" },
    { title: "Due today", tasks: dueToday, color: "text-warning", accent: "border-l-warning", icon: CalendarClock, id: "today" },
    { title: "Upcoming", tasks: upcoming, color: "text-muted-foreground", accent: "border-l-border", icon: Clock, id: "upcoming" },
    { title: "Completed", tasks: completed, color: "text-muted-foreground", accent: "border-l-border", icon: CheckCircle2, id: "completed" },
  ];

  const kpis = [
    { label: "Overdue", value: overdue.length, tone: overdue.length ? "text-destructive" : "text-foreground" },
    { label: "Due today", value: dueToday.length, tone: dueToday.length ? "text-warning" : "text-foreground" },
    { label: "Active", value: activeCount, tone: "text-foreground" },
    { label: "Done", value: completed.length, tone: "text-foreground" },
  ];

  const showingLabel = typeof total === "number"
    ? `Showing ${tasks.length} of ${total}`
    : `Showing ${tasks.length}`;

  const toggle = (id: string) =>
    setCollapsedSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const handleStatusChange = async (task: TaskRow, newStatus: string) => {
    if (newStatus === "done" && task.requires_review && !canEditTaskMetadata(task, user?.id, isAdminOrMD, { isHR, managedDepartments: managedDepartments || [] })) {
      setReviewTask({ task, mode: "submit" });
      return;
    }
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: "xlsx" | "csv") => {
    const rows = filtered.map(taskToExportRow);
    if (format === "csv") {
      downloadBlob(new Blob([toCsv(TASK_IMPORT_HEADERS, rows)], { type: "text/csv;charset=utf-8" }), "tasks.csv");
      toast.success("CSV exported");
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Tasks");
    ws.addRow([...TASK_IMPORT_HEADERS]);
    rows.forEach((row) => ws.addRow(row));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "tasks.xlsx",
    );
    toast.success("Excel exported");
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
    const hours = hoursMeta(task);

    return (
      <div
        id={`task-${task.id}`}
        className={cn(
          "flex items-center gap-2.5 px-3 sm:px-3.5 py-2 transition-colors group",
          "hover:bg-muted/40",
          highlightTaskId === task.id && "bg-muted ring-1 ring-inset ring-border",
        )}
      >
        <button
          type="button"
          className="text-muted-foreground hover:text-success transition-colors shrink-0 p-1 -ml-0.5 cursor-pointer rounded-md hover:bg-success/10"
          onClick={() => handleCompleteClick(task)}
          aria-label={task.status === "done" ? "Mark incomplete" : "Mark complete"}
        >
          {task.status === "done" ? (
            <CheckCircle2 className="h-[18px] w-[18px] text-success" />
          ) : (
            <Circle className="h-[18px] w-[18px]" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            className={cn(
              "block w-full text-[13px] text-left truncate transition-colors hover:text-foreground cursor-pointer leading-snug",
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
            {task.project_name && (
              <>
                <span className="opacity-30">·</span>
                <span className="truncate max-w-[140px]">{task.project_icon ? `${task.project_icon} ` : ""}{task.project_name}</span>
              </>
            )}
            {hours && (
              <>
                <span className="opacity-30">·</span>
                <span className="font-mono-num tabular-nums">{hours}</span>
              </>
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
                  "font-mono-num tabular-nums",
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
            "font-mono-num w-14 text-right tabular-nums",
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
              className="h-8 w-8 shrink-0 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
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
        <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
        <p className="text-[13px]">Loading your tasks…</p>
      </div>
    );
  }

  return (
    <div className="bg-background page-enter" data-testid="my-tasks-page">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b">
        <div className="px-4 md:px-6 pt-3 pb-0 max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-2.5">
            <div className="min-w-0 space-y-2">
              <h1 className="text-[22px] md:text-2xl font-semibold tracking-tight leading-[1.3] text-foreground">
                My Tasks
              </h1>
              <p className="text-[13px] text-muted-foreground font-mono-num tabular-nums">{showingLabel}</p>
              <div className="flex flex-wrap items-center gap-1.5" data-testid="my-tasks-metric-row">
                {kpis.map((chip) => (
                  <div
                    key={chip.label}
                    className="inline-flex flex-col justify-center rounded-md border bg-background px-2 py-1 min-w-[4.75rem]"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
                      {chip.label}
                    </span>
                    <span className={cn("text-[13px] font-semibold font-mono-num tabular-nums leading-tight mt-1", chip.tone)}>
                      {chip.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {canCreate && (
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setShowImport(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1" />Import
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    <Download className="h-3.5 w-3.5 mr-1" />Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void handleExport("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void handleExport("csv")}>CSV</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {canCreate && (
                <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />New task
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center pb-2">
            <div className="relative flex-1 min-w-0">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9 bg-background"
                placeholder="Search title, project, assignee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canFilterByUser && (
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[180px] text-xs cursor-pointer bg-background">
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
        </div>

        <div
          role="tablist"
          aria-label="Task views"
          className="flex items-center gap-0 overflow-x-auto px-4 md:px-6 max-w-5xl mx-auto"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  TAB_CLASS,
                  isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tab.label}
                <span className="font-mono-num text-[11px] tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 md:px-6 py-3 max-w-5xl mx-auto space-y-3">
        {sections.every((s) => s.tasks.length === 0) ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {activeTab === "assigned_to_me" && userFilter !== "all" && canFilterByUser
                ? `No tasks assigned to ${selectedMemberName || "this team member"}.`
                : "No tasks in this view."}
            </p>
            {canCreate && (
              <Button size="sm" className="cursor-pointer" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />Create task
              </Button>
            )}
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
                  className={cn("bg-background rounded-xl border overflow-hidden border-l-4", section.accent)}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3.5 py-2 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => toggle(section.id)}
                    aria-expanded={!isCollapsed}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed
                        ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      <Icon className={cn("h-3.5 w-3.5", section.color)} aria-hidden />
                      <span className="text-[13px] font-medium text-foreground">
                        {section.title}
                      </span>
                      <span className="font-mono-num text-[11px] text-muted-foreground tabular-nums">
                        {section.tasks.length}
                      </span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="border-t divide-y">
                      {section.tasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
        )}

        {hasMore && (
          <div className="flex justify-center pt-1">
            <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => void loadMore()} disabled={loading || loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>

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
