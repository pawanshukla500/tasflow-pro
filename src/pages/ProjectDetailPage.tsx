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
import { ProjectSectionsEditor } from "@/components/ProjectSectionsEditor";
import { useProject, useProjectMutations } from "@/hooks/useProjects";
import { useTasks, type TaskRow } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { useProjectSections } from "@/hooks/useProjectSections";
import { firstIncompleteSectionId } from "@/lib/projectLookup";
import { filterTasksForProject, formatHours, projectMetricChips, sumProjectTaskHours } from "@/lib/projectBudget";
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

const TAB_CLASS =
  "rounded-none border-b-2 border-transparent bg-transparent px-3 pb-2 pt-1.5 text-[13px] font-medium text-muted-foreground shadow-none gap-1.5 " +
  "data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { project, loading: projectLoading } = useProject(id);
  const {
    tasks: projectTasks,
    loading: tasksLoading,
    loadingMore,
    hasMore,
    loadMore,
    updateTaskStatus,
  } = useTasks({
    projectId: id,
    boundedMax: 800,
  });
  const { update, archive } = useProjectMutations();
  const { sections } = useProjectSections(id);
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

  const setView = (next: ProjectView, options?: { persist?: boolean }) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", next);
    setSearchParams(nextParams, { replace: true });
    if (options?.persist === false) return;
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

  const pipeline = useMemo(
    () => summarizeProjectPipeline(id ? filterTasksForProject(projectTasks, id) : []),
    [id, projectTasks],
  );
  const scopedTasks = useMemo(
    () => (id ? filterTasksForProject(projectTasks, id) : []),
    [id, projectTasks],
  );
  const hourTotals = useMemo(
    () => (id ? sumProjectTaskHours(scopedTasks, id) : { estimated: 0, logged: 0 }),
    [id, scopedTasks],
  );
  const currentSectionId = useMemo(
    () => (project?.flow_mode === "sequential" ? firstIncompleteSectionId(sections, scopedTasks) : null),
    [project?.flow_mode, sections, scopedTasks],
  );
  const today = todayIST();
  const metrics = useMemo(
    () => projectMetricChips({
      budgetAmount: project?.budget_amount,
      budgetCurrency: project?.budget_currency,
      allocatedHours: project?.allocated_hours,
      estimatedHours: hourTotals.estimated,
      loggedHours: hourTotals.logged,
    }),
    [project?.budget_amount, project?.budget_currency, project?.allocated_hours, hourTotals],
  );

  useEffect(() => {
    if (tasksLoading || loadingMore || !hasMore) return;
    void loadMore();
  }, [tasksLoading, loadingMore, hasMore, loadMore]);

  useEffect(() => {
    if (!focusStatus) return;
    const target = document.getElementById(`project-step-${focusStatus}`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [focusStatus, view]);

  const selectStep = (status: ProjectPipelineStatus) => {
    setFocusStatus(status);
    if (view !== "board" && view !== "list") {
      setView("board", { persist: false });
    }
  };

  if (projectLoading) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] gap-3 text-muted-foreground">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-[13px]">Loading project…</p>
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
  const showPipeline = view === "board" || view === "list";
  const showSections = view === "board" || view === "list";
  const description = project.description?.trim() || "";

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background page-enter">
      <header className="sticky top-0 z-20 shrink-0 bg-background/95 backdrop-blur-sm border-b">
        <div className="px-4 md:px-6 pt-3 pb-0">
          <Breadcrumb>
            <BreadcrumbList className="text-xs font-medium">
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/projects">Projects</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{project.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 py-2.5">
            <div className="min-w-0 space-y-2">
              <h1 className="flex items-center gap-2.5 min-w-0 text-[22px] md:text-2xl font-semibold tracking-tight leading-[1.3] text-foreground">
                <span
                  className="h-9 w-9 rounded-lg flex items-center justify-center text-lg shrink-0 border bg-muted/40"
                  style={{ backgroundColor: `${project.color}14` }}
                >
                  {project.icon}
                </span>
                <span className="truncate">{project.name}</span>
              </h1>
              {description ? (
                <p className="text-[13px] leading-[1.45] text-muted-foreground max-w-2xl line-clamp-2">{description}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5" data-testid="project-metric-row">
                {metrics.map((chip) => (
                  <div
                    key={chip.label}
                    className="inline-flex flex-col justify-center rounded-md border bg-background px-2 py-1 min-w-[4.75rem]"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-none">
                      {chip.label}
                    </span>
                    <span className="text-[13px] font-semibold font-mono-num tabular-nums leading-tight mt-1">
                      {chip.value}
                    </span>
                  </div>
                ))}
                {project.due_date && (
                  <div className="inline-flex flex-col justify-center rounded-md border bg-background px-2 py-1 min-w-[4.75rem]">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-none">Due</span>
                    <span className="text-[13px] font-semibold font-mono-num tabular-nums leading-tight mt-1">
                      {formatDateIST(project.due_date)}
                    </span>
                  </div>
                )}
              </div>
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
        </div>

        <Tabs value={view} onValueChange={(v) => setView(v as ProjectView)} className="px-4 md:px-6">
          <TabsList className="h-auto w-full justify-start bg-transparent p-0 rounded-none gap-0">
            <TabsTrigger value="board" className={TAB_CLASS}>
              <LayoutGrid className="h-3.5 w-3.5" />Board
            </TabsTrigger>
            <TabsTrigger value="list" className={TAB_CLASS}>
              <List className="h-3.5 w-3.5" />List
            </TabsTrigger>
            <TabsTrigger value="calendar" className={TAB_CLASS}>
              <CalendarIcon className="h-3.5 w-3.5" />Calendar
            </TabsTrigger>
            <TabsTrigger value="workflows" className={TAB_CLASS}>
              <GitBranch className="h-3.5 w-3.5" />Workflows
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 md:px-6 pt-2 pb-3 gap-2">
        {showPipeline && (
          <div className="shrink-0">
            <ProjectPipelineBar
              summary={pipeline}
              focusStatus={focusStatus}
              onSelectStep={selectStep}
              variant={view === "board" ? "compact" : "stepper"}
            />
            {(hasMore || loadingMore) && (
              <p className="text-[11px] text-muted-foreground mt-1">Loading remaining tasks…</p>
            )}
          </div>
        )}

        {showSections && (
          <div className="shrink-0">
            <ProjectSectionsEditor projectId={project.id} currentSectionId={currentSectionId} />
          </div>
        )}

        {tasksLoading && view !== "workflows" ? (
          <p className="text-[13px] text-muted-foreground">Loading tasks…</p>
        ) : view === "board" ? (
          <ProjectBoardView
            tasks={scopedTasks}
            focusStatus={focusStatus}
            columnRefs={columnRefs}
            sectionTitles={Object.fromEntries(sections.map((s) => [s.id, s.title]))}
            onCreateInStatus={(status) => {
              setCreateStatus(status);
              setShowCreate(true);
            }}
            onOpenTask={setEditingTask}
            onMoveTask={updateTaskStatus}
          />
        ) : view === "list" ? (
          <div className="flex-1 overflow-auto min-h-0 space-y-2 pb-1">
            {scopedTasks.length === 0 ? (
              <p className="text-[13px] text-muted-foreground text-center py-10">No tasks in this project yet.</p>
            ) : (
              PROJECT_BOARD_COLUMNS.map((col) => {
                const colTasks = scopedTasks.filter((t) => taskMatchesStatus(t.status, col.status));
                const isFocused = focusStatus === col.status;
                return (
                  <section
                    key={col.status}
                    id={`project-step-${col.status}`}
                    className={cn(
                      "bg-background rounded-xl border overflow-hidden",
                      isFocused && cn("ring-2", col.ring),
                    )}
                  >
                    <header className="flex items-center gap-2 px-4 py-2 border-b">
                      <span className={cn("h-2 w-2 rounded-full", col.accent)} aria-hidden />
                      <h2 className="text-[13px] font-semibold leading-tight flex-1">{col.label}</h2>
                      <span className="text-[12px] font-mono-num text-muted-foreground tabular-nums">{colTasks.length}</span>
                    </header>
                    {colTasks.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-4">No cards</p>
                    ) : (
                      <div className="divide-y">
                        {colTasks.map((task) => {
                          const isOverdue = task.due_date && task.due_date.slice(0, 10) < today && task.status !== "done";
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => setEditingTask(task)}
                              className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-muted/40"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                              />
                              <span className={cn("flex-1 text-[13px] font-medium truncate", task.status === "done" && "line-through text-muted-foreground")}>
                                {task.title}
                              </span>
                              {(task.section_name || (task.section_id && sections.find((s) => s.id === task.section_id))) && (
                                <span className="text-[11px] text-muted-foreground w-24 truncate hidden lg:inline">
                                  {task.section_name || sections.find((s) => s.id === task.section_id)?.title}
                                </span>
                              )}
                              {formatHours(task.estimated_hours) && (
                                <span className="text-[11px] font-mono-num text-muted-foreground w-10 text-right tabular-nums">
                                  {formatHours(task.estimated_hours)}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground w-24 truncate hidden md:inline">
                                {task.assignees[0]?.name || "Unassigned"}
                              </span>
                              <span className={cn("text-[11px] font-mono-num w-20 text-right tabular-nums", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
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
          <div className="bg-background rounded-xl border overflow-auto flex-1 min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <p className="text-[13px] font-semibold leading-tight">
                {month.toLocaleString("en-IN", { month: "long", year: "numeric" })}
              </p>
              <Button variant="ghost" size="icon" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} aria-label="Next month">
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-[11px] font-medium text-muted-foreground text-center py-2 border-b">{d}</div>
              ))}
              {days.map((day, i) => {
                if (day === null) return <div key={i} className="min-h-[88px] border-b border-r bg-muted/20" />;
                const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayTasks = scopedTasks.filter((t) => t.due_date?.slice(0, 10) === dateStr);
                const isToday = dateStr === today;
                return (
                  <div key={i} className="min-h-[88px] border-b border-r p-1">
                    <span className={cn("text-[12px] inline-flex w-6 h-6 items-center justify-center rounded-full tabular-nums", isToday && "bg-primary text-primary-foreground font-semibold")}>
                      {day}
                    </span>
                    <div className="space-y-0.5 mt-0.5">
                      {dayTasks.slice(0, 3).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditingTask(t)}
                          className="block w-full text-left text-[11px] truncate rounded px-1 py-0.5 hover:bg-muted"
                          style={{ borderLeft: `2px solid ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium}` }}
                        >
                          {t.title}
                        </button>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-[11px] text-muted-foreground px-1">+{dayTasks.length - 3}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto min-h-0" data-testid="project-workflows-view">
            {(workflows || []).length === 0 ? (
              <div className="max-w-md pt-6">
                <h2 className="text-base font-semibold leading-[1.3] text-foreground">No workflows yet</h2>
                <p className="text-[13px] leading-[1.45] text-muted-foreground mt-1">
                  Raise a multi-stage process for this project.
                </p>
                <Button className="mt-4" size="sm" onClick={() => navigate(`/workflows?project=${project.id}&raise=1`)}>
                  <GitBranch className="h-3.5 w-3.5 mr-1.5" />Raise workflow
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => navigate(`/workflows?project=${project.id}&raise=1`)}>
                    <GitBranch className="h-3.5 w-3.5 mr-1.5" />Raise workflow
                  </Button>
                </div>
                <div className="bg-background rounded-xl border divide-y">
                  {(workflows || []).map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-muted/40"
                      onClick={() => navigate(`/workflows?project=${project.id}&wf=${wf.id}`)}
                    >
                      <p className="text-[13px] font-medium leading-snug">{wf.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 capitalize font-mono-num tabular-nums">
                        {wf.status} · stage {wf.current_stage_position} · {formatDateIST(wf.created_at)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
