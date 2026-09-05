import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Calendar as CalendarIcon, LayoutGrid, List, GitBranch, ChevronLeft,
  Circle, Loader, Eye, CheckCircle2, Ban, Archive, Pencil,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/EmptyState";
import CreateTaskModal from "@/components/CreateTaskModal";
import EditTaskModal from "@/components/EditTaskModal";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { useProject, useProjectMutations } from "@/hooks/useProjects";
import { useTasks, type TaskRow } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { isProjectView, projectProgress, type ProjectView } from "@/lib/projects";
import { TASK_STATUS_LABELS } from "@/lib/taskPermissions";
import { todayIST, formatDateIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

type TaskStatus = "todo" | "in_progress" | "pending_review" | "done" | "blocked";

const columns: {
  status: TaskStatus;
  label: string;
  icon: LucideIcon;
  rail: string;
  tint: string;
  countBg: string;
}[] = [
  { status: "todo", label: "To Do", icon: Circle, rail: "bg-muted-foreground/50", tint: "from-muted/80 to-muted/20", countBg: "bg-muted text-muted-foreground" },
  { status: "in_progress", label: "In Progress", icon: Loader, rail: "bg-primary", tint: "from-primary/[0.08] to-transparent", countBg: "bg-primary/12 text-primary" },
  { status: "pending_review", label: "Pending Review", icon: Eye, rail: "bg-warning", tint: "from-warning/[0.08] to-transparent", countBg: "bg-warning/15 text-warning" },
  { status: "done", label: "Done", icon: CheckCircle2, rail: "bg-success", tint: "from-success/[0.08] to-transparent", countBg: "bg-success/12 text-success" },
  { status: "blocked", label: "Blocked", icon: Ban, rail: "bg-destructive", tint: "from-destructive/[0.08] to-transparent", countBg: "bg-destructive/12 text-destructive" },
];

const priorityColors: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const VIEW_LABELS: Record<ProjectView, string> = {
  board: "Board",
  list: "List",
  calendar: "Calendar",
  workflows: "Workflows",
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { project, loading: projectLoading } = useProject(id);
  const { tasks: projectTasks, loading: tasksLoading } = useTasks({
    projectId: id,
    boundedMax: 800,
  });
  const { update, archive } = useProjectMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState("todo");
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());

  const viewParam = searchParams.get("view");
  const view: ProjectView = isProjectView(viewParam)
    ? viewParam
    : (project?.default_view || "board");

  const setView = (next: ProjectView) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
    if (project && project.default_view !== next) {
      void update(project.id, { default_view: next }).catch(() => {});
    }
  };

  useEffect(() => {
    if (!viewParam && project?.default_view) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("view", project.default_view);
      setSearchParams(nextParams, { replace: true });
    }
  }, [project?.default_view, viewParam, searchParams, setSearchParams]);

  const { data: workflows } = useQuery({
    queryKey: ["project-workflows", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("id, title, status, priority, current_stage_position, created_at, outcome_label")
        .eq("project_id", id as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const today = todayIST();
  const done = projectTasks.filter((t) => t.status === "done").length;
  const pct = projectProgress(done, projectTasks.length);

  if (projectLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm">Loading project…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <EmptyState
          icon={LayoutGrid}
          title="Project not found"
          description="It may have been archived or you may not have access."
          action={{ label: "Back to projects", onClick: () => navigate("/projects") }}
        />
      </div>
    );
  }

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="p-4 md:p-6 space-y-4 h-full flex flex-col page-enter overflow-hidden">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/projects">Projects</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{VIEW_LABELS[view]}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-page-title flex items-center gap-2.5 min-w-0">
            <span
              className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
              style={{ backgroundColor: `${project.color}18` }}
            >
              {project.icon}
            </span>
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="text-page-desc max-w-2xl">
            {project.description || "Board, list, calendar, and workflows are views of the same project data."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <span className="text-xs text-muted-foreground">
            <span className="font-mono-num font-semibold text-foreground">{pct}%</span> complete
          </span>
          <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
          </Button>
          {project.status === "active" && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await archive(project.id);
                  toast.success("Project archived");
                  navigate("/projects");
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not archive");
                }
              }}
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" />Archive
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              setCreateStatus("todo");
              setShowCreate(true);
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />New task
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as ProjectView)}>
        <TabsList className="h-9 bg-muted/70">
          <TabsTrigger value="board" className="text-xs gap-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />Board
          </TabsTrigger>
          <TabsTrigger value="list" className="text-xs gap-1.5">
            <List className="h-3.5 w-3.5" />List
          </TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />Calendar
          </TabsTrigger>
          <TabsTrigger value="workflows" className="text-xs gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />Workflows
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tasksLoading && view !== "workflows" ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0">
          {columns.map((col) => {
            const colTasks = projectTasks.filter(
              (t) => t.status === col.status || (col.status === "pending_review" && t.status === "in_review"),
            );
            const ColIcon = col.icon;
            return (
              <div key={col.status} className="w-[280px] md:w-[300px] shrink-0 flex flex-col rounded-2xl border bg-card/70 overflow-hidden">
                <div className={cn("relative bg-gradient-to-b", col.tint)}>
                  <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", col.rail)} aria-hidden />
                  <div className="flex items-center gap-2 pl-4 pr-2 py-3">
                    <ColIcon className="h-3.5 w-3.5" />
                    <p className="text-sm font-semibold flex-1">{col.label}</p>
                    <span className={cn("text-[10px] font-mono-num px-2 py-0.5 rounded-md", col.countBg)}>{colTasks.length}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Add task to ${col.label}`}
                      onClick={() => { setCreateStatus(col.status); setShowCreate(true); }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-2.5 pb-2.5 min-h-[120px]">
                  {colTasks.map((task) => {
                    const isOverdue = task.due_date && task.due_date < today && task.status !== "done";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => setEditingTask(task)}
                        className="card-premium p-3.5 w-full text-left hover-lift"
                      >
                        <p className="text-sm font-semibold leading-snug line-clamp-2">{task.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: priorityColors[task.priority] }} />
                            {task.priority}
                          </span>
                          {task.department_name && (
                            <Badge variant="secondary" className="text-[9px] h-5 px-1.5">{task.department_name}</Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                          <span className="text-[10px] text-muted-foreground truncate">
                            {task.assignees[0]?.name || "Unassigned"}
                            {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                          </span>
                          {task.due_date && (
                            <span className={cn("text-[10px] font-mono-num", isOverdue && "text-destructive font-semibold")}>
                              {formatDateIST(task.due_date)}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <div className="bg-card rounded-xl border divide-y flex-1 overflow-auto">
          {projectTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No tasks in this project yet.</p>
          ) : (
            projectTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setEditingTask(task)}
                className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: priorityColors[task.priority] }}
                />
                <span className={cn("flex-1 text-sm font-medium truncate", task.status === "done" && "line-through text-muted-foreground")}>
                  {task.title}
                </span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {TASK_STATUS_LABELS[task.status] || task.status}
                </span>
                <span className="text-[11px] text-muted-foreground w-24 truncate hidden md:inline">
                  {task.assignees[0]?.name || "Unassigned"}
                </span>
                <span className="text-[11px] font-mono-num text-muted-foreground w-20 text-right">
                  {task.due_date ? formatDateIST(task.due_date) : "—"}
                </span>
              </button>
            ))
          )}
        </div>
      ) : view === "calendar" ? (
        <div className="bg-card rounded-xl border overflow-hidden flex-1">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="text-sm font-semibold">
              {month.toLocaleString("en-IN", { month: "long", year: "numeric" })}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} aria-label="Next month">
              <ChevronLeft className="h-4 w-4 rotate-180" />
            </Button>
          </div>
          <div className="grid grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-[10px] font-medium text-muted-foreground text-center py-2 border-b">{d}</div>
            ))}
            {days.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-[88px] border-b border-r bg-muted/20" />;
              const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayTasks = projectTasks.filter((t) => t.due_date === dateStr);
              const isToday = dateStr === today;
              return (
                <div key={i} className="min-h-[88px] border-b border-r p-1">
                  <span className={cn("text-xs inline-flex w-6 h-6 items-center justify-center rounded-full", isToday && "bg-primary text-primary-foreground font-bold")}>
                    {day}
                  </span>
                  <div className="space-y-0.5 mt-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setEditingTask(t)}
                        className="block w-full text-left text-[10px] truncate rounded px-1 py-0.5 hover:bg-muted"
                        style={{ borderLeft: `2px solid ${priorityColors[t.priority]}` }}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && (
                      <p className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3 flex-1 overflow-auto">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => navigate(`/workflows?project=${project.id}&raise=1`)}>
              <GitBranch className="h-3.5 w-3.5 mr-1.5" />Raise workflow
            </Button>
          </div>
          {(workflows || []).length === 0 ? (
            <EmptyState
              icon={GitBranch}
              title="No workflows in this project"
              description="Raise a multi-stage process from a template and it will stay attached to this space."
              action={{ label: "Raise workflow", onClick: () => navigate(`/workflows?project=${project.id}&raise=1`) }}
            />
          ) : (
            <div className="bg-card rounded-xl border divide-y">
              {(workflows || []).map((wf) => (
                <button
                  key={wf.id}
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() => navigate(`/workflows?project=${project.id}&wf=${wf.id}`)}
                >
                  <p className="text-sm font-medium">{wf.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                    {wf.status} · stage {wf.current_stage_position} · {formatDateIST(wf.created_at)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          initialStatus={createStatus}
          initialProjectId={project.id}
          onCreated={() => setShowCreate(false)}
        />
      )}
      {editingTask && (
        <EditTaskModal task={editingTask} onClose={() => setEditingTask(null)} />
      )}
      <CreateProjectDialog open={editProjectOpen} onOpenChange={setEditProjectOpen} project={project} />
    </div>
  );
}
