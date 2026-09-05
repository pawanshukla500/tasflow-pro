import { useState, type MutableRefObject } from "react";
import { Plus, Circle, Loader, Eye, CheckCircle2, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TaskRow } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { allowedStatusesForUser } from "@/lib/taskPermissions";
import {
  PROJECT_BOARD_COLUMNS,
  taskMatchesStatus,
  type ProjectPipelineStatus,
} from "@/lib/projectPipeline";
import { todayIST, formatDateIST } from "@/lib/time";
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

const COLUMN_TINT: Record<ProjectPipelineStatus, string> = {
  todo: "from-muted/80 to-muted/20",
  in_progress: "from-primary/[0.08] to-transparent",
  pending_review: "from-warning/[0.08] to-transparent",
  done: "from-success/[0.08] to-transparent",
  blocked: "from-destructive/[0.08] to-transparent",
};

const COLUMN_COUNT: Record<ProjectPipelineStatus, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/12 text-primary",
  pending_review: "bg-warning/15 text-warning",
  done: "bg-success/12 text-success",
  blocked: "bg-destructive/12 text-destructive",
};

interface ProjectBoardViewProps {
  tasks: TaskRow[];
  focusStatus: ProjectPipelineStatus | null;
  columnRefs: MutableRefObject<Partial<Record<ProjectPipelineStatus, HTMLElement | null>>>;
  onCreateInStatus: (status: ProjectPipelineStatus) => void;
  onOpenTask: (task: TaskRow) => void;
  onMoveTask: (taskId: string, status: ProjectPipelineStatus) => Promise<unknown>;
}

export function ProjectBoardView({
  tasks,
  focusStatus,
  columnRefs,
  onCreateInStatus,
  onOpenTask,
  onMoveTask,
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
              "flex-1 min-w-[13rem] basis-0 flex flex-col rounded-2xl border overflow-hidden transition-all duration-200",
              isOver
                ? "bg-primary/[0.06] border-primary/35 ring-2 ring-primary/20 ring-inset shadow-md"
                : isFocused
                  ? cn("bg-card border-border ring-2 ring-inset", col.ring)
                  : "bg-card/70 border-border/70",
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
            <div className={cn("relative bg-gradient-to-b shrink-0", COLUMN_TINT[col.status])}>
              <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl", COLUMN_RAIL[col.status])} aria-hidden />
              <div className="flex items-center gap-2 pl-4 pr-2 py-2.5">
                <ColIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <p className="text-sm font-semibold flex-1 truncate">{col.label}</p>
                <span className={cn("text-[10px] font-mono-num font-semibold px-2 py-0.5 rounded-md tabular-nums", COLUMN_COUNT[col.status])}>
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
            <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2 min-h-0">
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
                      "card-premium p-3 w-full text-left hover-lift",
                      allowed.length > 0 ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      isDragging && "opacity-40 scale-[0.97]",
                    )}
                  >
                    <p className="text-sm font-semibold leading-snug line-clamp-2">{task.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] capitalize text-muted-foreground">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                        />
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
  );
}
