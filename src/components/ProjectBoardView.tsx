import { useState, type MutableRefObject } from "react";
import { Plus, Circle, Loader, Eye, CheckCircle2, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskRow } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { allowedStatusesForUser } from "@/lib/taskPermissions";
import {
  PROJECT_BOARD_COLUMNS,
  taskMatchesStatus,
  type ProjectPipelineStatus,
} from "@/lib/projectPipeline";
import { todayIST, formatDateIST } from "@/lib/time";
import { formatHours } from "@/lib/projectBudget";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRIORITY_COLORS: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const COLUMN_ICONS: Record<ProjectPipelineStatus, LucideIcon> = {
  todo: Circle,
  in_progress: Loader,
  pending_review: Eye,
  done: CheckCircle2,
  blocked: Ban,
};

const COLUMN_RAIL: Record<ProjectPipelineStatus, string> = {
  todo: "bg-muted-foreground/50",
  in_progress: "bg-primary",
  pending_review: "bg-warning",
  done: "bg-success",
  blocked: "bg-destructive",
};

interface ProjectBoardViewProps {
  tasks: TaskRow[];
  focusStatus: ProjectPipelineStatus | null;
  columnRefs: MutableRefObject<Partial<Record<ProjectPipelineStatus, HTMLElement | null>>>;
  onCreateInStatus: (status: ProjectPipelineStatus) => void;
  onOpenTask: (task: TaskRow) => void;
  onMoveTask: (taskId: string, status: ProjectPipelineStatus) => Promise<unknown>;
  sectionTitles?: Record<string, string>;
}

export function ProjectBoardView({
  tasks,
  focusStatus,
  columnRefs,
  onCreateInStatus,
  onOpenTask,
  onMoveTask,
  sectionTitles = {},
}: ProjectBoardViewProps) {
  const { user, isAdminOrMD, managedDepartments } = useAuth();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<ProjectPipelineStatus | null>(null);
  const today = todayIST();

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

  const handleDrop = async (e: React.DragEvent, newStatus: ProjectPipelineStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain");
    setDragOverCol(null);
    if (!taskId) return;
    const task = getTask(taskId);
    if (!task) return;
    if (taskMatchesStatus(task.status, newStatus)) return;
    if (!canMoveToStatus(task, newStatus)) {
      toast.error("You are not allowed to move this task to that status");
      return;
    }
    if (newStatus === "done" && task.due_date && task.due_date.slice(0, 10) < today) {
      toast.info("Late completion will be recorded and may affect performance score.");
    }
    await onMoveTask(taskId, newStatus);
  };

  return (
    <div className="flex gap-2.5 overflow-x-auto overflow-y-hidden flex-1 min-h-0 pb-1">
      {PROJECT_BOARD_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => taskMatchesStatus(t.status, col.status));
        const ColIcon = COLUMN_ICONS[col.status];
        const isOver = dragOverCol === col.status;
        const isFocused = focusStatus === col.status;
        return (
          <div
            key={col.status}
            id={`project-step-${col.status}`}
            ref={(el) => {
              columnRefs.current[col.status] = el;
            }}
            className={cn(
              "flex-1 min-w-[9.5rem] md:min-w-0 basis-0 flex flex-col rounded-xl border overflow-hidden transition-all duration-200 bg-muted/30",
              isOver
                ? "border-primary/35 ring-2 ring-primary/15 ring-inset"
                : isFocused
                  ? cn("bg-background ring-2 ring-inset", col.ring)
                  : "border-border/70",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCol(col.status);
            }}
            onDragLeave={(e) => {
              const t = e.currentTarget;
              const r = e.relatedTarget as HTMLElement | null;
              if (r && t.contains(r)) return;
              setDragOverCol(null);
            }}
            onDrop={(e) => void handleDrop(e, col.status)}
          >
            <div className={cn("relative shrink-0 border-b border-border/60")}>
              <div className={cn("absolute left-0 top-0 bottom-0 w-0.5", COLUMN_RAIL[col.status])} aria-hidden />
              <div className="flex items-center gap-2 pl-3 pr-1 py-2">
                <ColIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <p className="text-[13px] font-semibold leading-tight flex-1 truncate">{col.label}</p>
                <span className="text-[12px] font-mono-num text-muted-foreground tabular-nums">
                  {colTasks.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Add task to ${col.label}`}
                  onClick={() => onCreateInStatus(col.status)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-2 min-h-0">
              {colTasks.map((task) => {
                const isOverdue = task.due_date && task.due_date.slice(0, 10) < today && task.status !== "done";
                const allowed = allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || []);
                const isDragging = draggedTaskId === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    draggable={allowed.length > 0}
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onOpenTask(task)}
                    className={cn(
                      "rounded-lg border bg-background p-2.5 w-full text-left hover:bg-muted/40",
                      allowed.length > 0 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      isDragging && "opacity-40",
                    )}
                  >
                    <p className="text-[13px] font-medium leading-snug line-clamp-2">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1.5">
                      <span className="inline-flex items-center gap-1 text-[11px] capitalize text-muted-foreground">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                        />
                        {task.priority}
                      </span>
                      {formatHours(task.estimated_hours) && (
                        <span className="text-[11px] font-mono-num text-muted-foreground tabular-nums">{formatHours(task.estimated_hours)}</span>
                      )}
                      {(task.section_name || (task.section_id && sectionTitles[task.section_id])) && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[7rem]">
                          {task.section_name || sectionTitles[task.section_id as string]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[11px] text-muted-foreground truncate">
                        {task.assignees[0]?.name || "Unassigned"}
                        {task.assignees.length > 1 ? ` +${task.assignees.length - 1}` : ""}
                      </span>
                      {task.due_date && (
                        <span className={cn("text-[11px] font-mono-num tabular-nums", isOverdue && "text-destructive font-semibold")}>
                          {formatDateIST(task.due_date)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {colTasks.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-4">No cards</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
