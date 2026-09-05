import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Plus, Calendar as CalendarIcon, LayoutGrid, List, GitBranch, ChevronLeft,
  Archive, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { ProjectPipelineBar } from "@/components/ProjectPipelineBar";
import { ProjectBoardView } from "@/components/ProjectBoardView";
import { useProject, useProjectMutations } from "@/hooks/useProjects";
import { useTasks, type TaskRow } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { isProjectView, type ProjectView } from "@/lib/projects";
import {
  PROJECT_BOARD_COLUMNS,
  summarizeProjectPipeline,
  taskMatchesStatus,
  type ProjectPipelineStatus,
} from "@/lib/projectPipeline";
import { formatDateIST, todayIST } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

const PRIORITY_COLORS: Record<string, string> = {
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
  const { tasks: projectTasks, loading: tasksLoading, updateTaskStatus } = useTasks({
    projectId: id,
    boundedMax: 800,
  });
  const { update, archive } = useProjectMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState("todo");
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const [focusStatus, setFocusStatus] = useState<ProjectPipelineStatus | null>(null);
  const columnRefs = useRef<Partial<Record<ProjectPipelineStatus, HTMLElement | null>>>({});

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

  const pipeline = useMemo(() => summarizeProjectPipeline(projectTasks), [projectTasks]);
  const today = todayIST();

  useEffect(() => {
    if (!focusStatus) return;
    const target = document.getElementById(`project-step-${focusStatus}`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [focusStatus, view]);

  const selectStep = (status: ProjectPipelineStatus) => {
    setFocusStatus(status);
    if (view !== "board" && view !== "list") {
      setView("board");
    }
  };

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
    <div className="p-4 md:p-6 space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden page-enter">
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

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 shrink-0">
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

      <div className="shrink-0">
        <ProjectPipelineBar
          summary={pipeline}
          focusStatus={focusStatus}
          onSelectStep={selectStep}
        />
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as ProjectView)} className="shrink-0">
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
        <ProjectBoardView
          tasks={projectTasks}
          focusStatus={focusStatus}
          columnRefs={columnRefs}
          onCreateInStatus={(status) => {
            setCreateStatus(status);
            setShowCreate(true);
          }}
          onOpenTask={setEditingTask}
          onMoveTask={updateTaskStatus}
        />
      ) : view === "list" ? (
        <div className="flex-1 overflow-auto min-h-0 space-y-3 pb-2">
          {projectTasks.length === 0 ? (
            <div className="bg-card rounded-xl border">
              <p className="text-sm text-muted-foreground text-center py-12">No tasks in this project yet.</p>
            </div>
          ) : (
            PROJECT_BOARD_COLUMNS.map((col) => {
              const colTasks = projectTasks.filter((t) => taskMatchesStatus(t.status, col.status));
              const isFocused = focusStatus === col.status;
              return (
                <section
                  key={col.status}
                  id={`project-step-${col.status}`}
                  className={cn(
                    "bg-card rounded-xl border overflow-hidden",
                    isFocused && cn("ring-2", col.ring),
                  )}
                >
                  <header className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30">
                    <span className={cn("h-2 w-2 rounded-full", col.accent)} aria-hidden />
                    <h2 className="text-sm font-semibold flex-1">{col.label}</h2>
                    <span className="text-[11px] font-mono-num text-muted-foreground">{colTasks.length}</span>
                  </header>
                  {colTasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">No tasks</p>
                  ) : (
                    <div className="divide-y">
                      {colTasks.map((task) => {
                        const isOverdue = task.due_date && task.due_date.slice(0, 10) < today && task.status !== "done";
                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setEditingTask(task)}
                            className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                            />
                            <span className={cn("flex-1 text-sm font-medium truncate", task.status === "done" && "line-through text-muted-foreground")}>
                              {task.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground w-24 truncate hidden md:inline">
                              {task.assignees[0]?.name || "Unassigned"}
                            </span>
                            <span className={cn("text-[11px] font-mono-num w-20 text-right", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                              {task.due_date ? formatDateIST(task.due_date) : "—"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      ) : view === "calendar" ? (
        <div className="bg-card rounded-xl border overflow-auto flex-1 min-h-0">
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
              const dayTasks = projectTasks.filter((t) => t.due_date?.slice(0, 10) === dateStr);
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
                        style={{ borderLeft: `2px solid ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium}` }}
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
        <div className="space-y-3 flex-1 overflow-auto min-h-0">
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
