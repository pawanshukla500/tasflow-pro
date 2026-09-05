import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, FolderKanban, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { useProjects, useProjectMutations } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { type ProjectRow, type ProjectStatusBreakdown, type ProjectWithStats } from "@/lib/projects";
import { PROJECT_FLOW_STEPS, PROJECT_BLOCKED_STEP, pipelineStatusOf } from "@/lib/projectPipeline";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const { projects, loading } = useProjects(showArchived);
  const { archive } = useProjectMutations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);

  const { data: taskCounts } = useQuery({
    queryKey: ["project-task-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tasks").select("project_id, status");
      if (error) {
        if (/does not exist|42703|PGRST205|schema cache/i.test(error.message)) {
          return new Map<string, ProjectStatusBreakdown>();
        }
        throw error;
      }
      const empty = (): ProjectStatusBreakdown => ({
        todo: 0,
        in_progress: 0,
        pending_review: 0,
        done: 0,
        blocked: 0,
      });
      const map = new Map<string, ProjectStatusBreakdown>();
      for (const row of data || []) {
        if (!row.project_id) continue;
        const cur = map.get(row.project_id) || empty();
        cur[pipelineStatusOf(row.status)] += 1;
        map.set(row.project_id, cur);
      }
      return map;
    },
    staleTime: 60_000,
  });

  const { data: workflowCounts } = useQuery({
    queryKey: ["project-workflow-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("workflows").select("project_id");
      if (error) {
        if (/does not exist|42703|PGRST205|schema cache/i.test(error.message)) return new Map<string, number>();
        throw error;
      }
      const map = new Map<string, number>();
      for (const row of data || []) {
        if (!row.project_id) continue;
        map.set(row.project_id, (map.get(row.project_id) || 0) + 1);
      }
      return map;
    },
    staleTime: 60_000,
  });

  const cards: ProjectWithStats[] = useMemo(() => {
    return projects.map((p) => {
      const statusCounts = taskCounts?.get(p.id) || {
        todo: 0,
        in_progress: 0,
        pending_review: 0,
        done: 0,
        blocked: 0,
      };
      const doneTaskCount = statusCounts.done;
      const openTaskCount =
        statusCounts.todo + statusCounts.in_progress + statusCounts.pending_review + statusCounts.blocked;
      return {
        ...p,
        statusCounts,
        openTaskCount,
        doneTaskCount,
        workflowCount: workflowCounts?.get(p.id) || 0,
      };
    });
  }, [projects, taskCounts, workflowCounts]);

  const visible = showArchived ? cards : cards.filter((c) => c.status === "active");

  return (
    <div className="p-4 md:p-6 page-enter">
      <PageHeader
        title="Projects"
        description="Spaces for work — board, list, calendar, and workflows share the same tasks, like AppFlowy databases."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              {showArchived ? "Hiding archive" : "Show archived"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />New project
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-muted-foreground">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm">Loading projects…</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={showArchived ? "No archived projects" : "No projects yet"}
          description="Create a project to group tasks and workflows. Each project has Board, List, Calendar, and Workflows views of the same work."
          action={{
            label: "Create project",
            onClick: () => {
              setEditing(null);
              setDialogOpen(true);
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {visible.map((project) => {
            const total = project.openTaskCount + project.doneTaskCount;
            const steps = [...PROJECT_FLOW_STEPS, PROJECT_BLOCKED_STEP];
            return (
              <div
                key={project.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/projects/${project.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/projects/${project.id}`);
                  }
                }}
                className="text-left bg-card rounded-2xl border overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer"
              >
                <div className="h-1.5" style={{ backgroundColor: project.color }} />
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-10 w-10 rounded-xl flex items-center justify-center text-xl shrink-0 border"
                        style={{ backgroundColor: `${project.color}18` }}
                      >
                        {project.icon}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground truncate">{project.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {project.description || "No description"}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Project actions for ${project.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(project);
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </DropdownMenuItem>
                        {project.status === "active" && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={async () => {
                              try {
                                await archive(project.id);
                                toast.success("Project archived");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Could not archive");
                              }
                            }}
                          >
                            Archive
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>
                        <span className="font-mono-num font-semibold text-foreground">{project.doneTaskCount}</span>
                        {" of "}
                        <span className="font-mono-num font-semibold text-foreground">{total}</span>
                        {" done"}
                      </span>
                      {project.workflowCount > 0 && (
                        <span className="font-mono-num">{project.workflowCount} workflow{project.workflowCount === 1 ? "" : "s"}</span>
                      )}
                    </div>
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                      {total === 0 ? (
                        <div className="h-full w-full bg-muted" />
                      ) : (
                        steps.map((step) => {
                          const count = project.statusCounts[step.status];
                          if (count <= 0) return null;
                          return (
                            <div
                              key={step.id}
                              className={cn("h-full min-w-[2px]", step.bar)}
                              style={{ flexGrow: count }}
                              title={`${step.label}: ${count}`}
                            />
                          );
                        })
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {steps.map((step) => (
                        <div key={step.id} className="text-center p-1.5 bg-muted/50 rounded-md">
                          <p className="text-sm font-mono-num font-bold text-foreground leading-none">
                            {project.statusCounts[step.status]}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-1 truncate">{step.shortLabel}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {project.status === "archived" && (
                    <p className={cn("mt-3 text-[10px] font-medium uppercase tracking-wide text-muted-foreground")}>
                      Archived
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        project={editing}
        onSaved={(saved) => {
          if (!editing) navigate(`/projects/${saved.id}`);
        }}
      />
    </div>
  );
}
