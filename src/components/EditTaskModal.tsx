import { useState, useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { X, CalendarIcon, ShieldCheck, Send, CheckCircle, XCircle, Clock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TaskRow } from "@/hooks/useTasks";
import TaskAttachments from "@/components/TaskAttachments";
import TaskDiscussion from "@/components/TaskDiscussion";
import SubtaskEditor, { type SubtaskDraft } from "@/components/SubtaskEditor";
import TaskReviewDialog from "@/components/TaskReviewDialog";
import { ExtendTaskDueDateDialog } from "@/components/ExtendTaskDueDateDialog";
import { EntityLookupField, EntityLinkPreview } from "@/components/EntityLookupField";
import { useProjectSections } from "@/hooks/useProjectSections";
import { resolveTaskContainerAssignment, sectionIdForProject } from "@/lib/projectLookup";
import { isUnknownColumnError, omitTaskHourColumns, parseNonNegativeNumber } from "@/lib/projectBudget";
import { assistTask } from "@/lib/taskAi";
import {
  allowedStatusesForUser,
  canApproveOrRejectReview,
  canEditTaskMetadata,
  canExtendTaskDueDate,
  canSubmitForReview,
  TASK_STATUS_LABELS,
} from "@/lib/taskPermissions";

interface EditTaskModalProps {
  task: TaskRow;
  onClose: () => void;
  onSaved?: () => void;
}

type Priority = "critical" | "high" | "medium" | "low";
const priorities: Priority[] = ["critical", "high", "medium", "low"];
const priorityColorMap: Record<Priority, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-success text-success-foreground",
};

const EditTaskModal = ({ task, onClose, onSaved }: EditTaskModalProps) => {
  const { user, isAdminOrMD, isHR, managedDepartments } = useAuth();
  const canEdit = canEditTaskMetadata(task, user?.id, isAdminOrMD, { isHR, managedDepartments: managedDepartments || [] });
  const canExtendDue = canExtendTaskDueDate(task, user?.id, isAdminOrMD);
  const statusOptions = allowedStatusesForUser(task, user?.id, isAdminOrMD, managedDepartments || [], { isHR });

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState<Priority>((task.priority as Priority) || "medium");
  const [status, setStatus] = useState(task.status);
  const [deptId, setDeptId] = useState(task.department_id || "");
  const [projectId, setProjectId] = useState(task.project_id || "");
  const [sectionId, setSectionId] = useState(task.section_id || "");
  const [estimatedHours, setEstimatedHours] = useState(
    task.estimated_hours != null ? String(task.estimated_hours) : "",
  );
  const [loggedHours, setLoggedHours] = useState(
    task.logged_hours != null ? String(task.logged_hours) : "",
  );
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map((a) => a.user_id));
  const [dueDate, setDueDate] = useState<Date | undefined>(task.due_date ? new Date(task.due_date) : undefined);
  const [frequency, setFrequency] = useState(task.frequency || "none");
  const [requiresReview, setRequiresReview] = useState(!!task.requires_review);
  const [reviewerUserId, setReviewerUserId] = useState(task.reviewer_user_id || "");
  const [saving, setSaving] = useState(false);
  const [reviewMode, setReviewMode] = useState<"submit" | "approve" | "reject" | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; department_id: string | null }[]>([]);
  const { sections, loading: sectionsLoading } = useProjectSections(projectId || undefined);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [showExtendDue, setShowExtendDue] = useState(false);
  const [aiBusy, setAiBusy] = useState<"description" | "subtasks" | null>(null);
  const subtasksDirty = useRef(false);
  const [displayDueDate, setDisplayDueDate] = useState(task.due_date);
  const [extensionHistory, setExtensionHistory] = useState<
    { old_due_date: string | null; new_due_date: string; reason: string; created_at: string }[]
  >([]);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || "");
    setPriority((task.priority as Priority) || "medium");
    setStatus(task.status);
    setDeptId(task.department_id || "");
    setProjectId(task.project_id || "");
    setSectionId(task.section_id || "");
    setEstimatedHours(task.estimated_hours != null ? String(task.estimated_hours) : "");
    setLoggedHours(task.logged_hours != null ? String(task.logged_hours) : "");
    setAssignees(task.assignees.map((a) => a.user_id));
    setDueDate(task.due_date ? new Date(task.due_date) : undefined);
    setFrequency(task.frequency || "none");
    setRequiresReview(!!task.requires_review);
    setReviewerUserId(task.reviewer_user_id || "");
    setDisplayDueDate(task.due_date);
    subtasksDirty.current = false;
  }, [task.id]);

  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name"),
      supabase.from("projects").select("id, name, icon").eq("status", "active").order("name"),
      supabase.from("task_subtasks").select("id, title, completed, position").eq("task_id", task.id).order("position"),
      supabase.from("task_due_date_events").select("old_due_date, new_due_date, reason, created_at").eq("task_id", task.id).order("created_at", { ascending: false }).limit(5),
    ]).then(async ([d, u, p, st, ext]) => {
      setDepartments(d.data || []);
      setUsers(u.data || []);
      const list = [...((p.data || []) as { id: string; name: string; icon: string }[])];
      if (task.project_id && !list.some((row) => row.id === task.project_id)) {
        const { data: current } = await supabase
          .from("projects")
          .select("id, name, icon")
          .eq("id", task.project_id)
          .maybeSingle();
        if (current) list.push(current as { id: string; name: string; icon: string });
      }
      setProjects(list);
      if (!subtasksDirty.current) {
        setSubtasks((st.data || []).map((s) => ({ id: s.id, title: s.title, completed: s.completed })));
      }
      setExtensionHistory(ext.data || []);
    });
  }, [task.id, displayDueDate, task.project_id]);

  const handleSave = async () => {
    if (!canEdit) {
      if (status === task.status) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        const { error } = await supabase.from("tasks").update({ status }).eq("id", task.id);
        if (error) throw error;
        toast.success("Status updated");
        onSaved?.();
        onClose();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to update status");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (assignees.length === 0) {
      toast.error("Please select at least one doer");
      return;
    }
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        title: title.trim(),
        description: description || null,
        priority,
        status,
        department_id: deptId || null,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        frequency,
        requires_review: requiresReview,
        reviewer_user_id: requiresReview && reviewerUserId ? reviewerUserId : null,
        estimated_hours: parseNonNegativeNumber(estimatedHours),
        logged_hours: parseNonNegativeNumber(loggedHours) ?? 0,
      };
      if (projects.length > 0 || projectId || task.project_id) {
        updates.project_id = projectId || null;
      }
      const container = resolveTaskContainerAssignment({
        projectId: projectId || null,
        sectionId: sectionId || null,
        projects,
        sections,
        projectsLoaded: projects.length > 0 || !projectId,
        sectionsLoaded: !sectionsLoading,
      });
      if (!container.ok) {
        toast.error(container.error);
        setSaving(false);
        return;
      }
      if (projects.length > 0 || projectId || task.project_id || task.section_id) {
        updates.section_id = container.sectionId;
      }
      if (status === "done" && !task.completed_at) updates.completed_at = new Date().toISOString();
      if (status !== "done") updates.completed_at = null;

      let { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
      if (error && isUnknownColumnError(error.message)) {
        ({ error } = await supabase.from("tasks").update(omitTaskHourColumns(updates)).eq("id", task.id));
      }
      if (error) throw error;

      const current = new Set(task.assignees.map((a) => a.user_id));
      const next = new Set(assignees);
      const toRemove = [...current].filter((id) => !next.has(id));
      const toAdd = [...next].filter((id) => !current.has(id));
      if (toRemove.length > 0) {
        const { error: delErr } = await supabase.from("task_assignees").delete().eq("task_id", task.id).in("user_id", toRemove);
        if (delErr) throw delErr;
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((uid) => ({ task_id: task.id, user_id: uid }));
        const { error: insErr } = await supabase.from("task_assignees").insert(rows);
        if (insErr) throw insErr;
      }

      const existingIds = new Set(subtasks.filter((s) => s.id).map((s) => s.id as string));
      const originalIds = (task.subtasks || []).map((s) => s.id);
      const toDelete = originalIds.filter((id) => !existingIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from("task_subtasks").delete().in("id", toDelete);
      }
      for (let i = 0; i < subtasks.length; i++) {
        const st = subtasks[i];
        const stTitle = st.title.trim();
        if (!stTitle) continue;
        if (st.id) {
          await supabase.from("task_subtasks").update({
            title: stTitle,
            completed: !!st.completed,
            position: i,
          }).eq("id", st.id);
        } else {
          await supabase.from("task_subtasks").insert({
            task_id: task.id,
            title: stTitle,
            completed: !!st.completed,
            position: i,
          });
        }
      }

      toast.success("Task updated");
      onSaved?.();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update task");
    } finally {
      setSaving(false);
    }
  };

  const showSubmitReview = canSubmitForReview(task, user?.id);
  const showReviewActions = canApproveOrRejectReview(task, user?.id, isAdminOrMD, managedDepartments || []);
  const fallbackParticipants = useMemo(() => {
    const people: { id: string; name: string; avatarUrl: string | null }[] = task.assignees.map((assignee) => ({
      id: assignee.user_id,
      name: assignee.name,
      avatarUrl: null,
    }));
    if (task.created_by && task.creator_name) {
      people.push({ id: task.created_by, name: task.creator_name, avatarUrl: null });
    }
    if (task.reviewer_user_id) {
      const reviewer = users.find((person) => person.id === task.reviewer_user_id);
      people.push({ id: task.reviewer_user_id, name: reviewer?.name || "Reviewer", avatarUrl: null });
    }
    return people.filter((person) => person.id !== user?.id);
  }, [task.assignees, task.created_by, task.creator_name, task.reviewer_user_id, users, user?.id]);

  const assigneeName = (id: string) =>
    users.find((person) => person.id === id)?.name
    || task.assignees.find((assignee) => assignee.user_id === id)?.name
    || "Teammate";

  const runAssist = async (kind: "description" | "subtasks") => {
    if (!title.trim() && !description.trim()) {
      toast.error("Add a title or description first");
      return;
    }
    const startedDescription = description;
    setAiBusy(kind);
    try {
      const result = await assistTask({
        action: kind === "description" ? "improve_description" : "suggest_subtasks",
        title: title.trim() || task.title,
        description,
      });
      if (kind === "description" && result.description) {
        let applied = false;
        setDescription((current) => {
          if (current !== startedDescription) return current;
          applied = true;
          return result.description!;
        });
        if (applied) toast.success("Description updated. Save the task to keep it.");
      }
      if (kind === "subtasks" && result.subtasks?.length) {
        subtasksDirty.current = true;
        setSubtasks((current) => {
          const existing = new Set(current.map((item) => item.title.trim().toLowerCase()));
          const added = result.subtasks!
            .filter((item) => !existing.has(item.toLowerCase()))
            .map((item) => ({ title: item, completed: false }));
          return added.length ? [...current, ...added] : current;
        });
        toast.success("Subtasks added. Save the task to keep them.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI suggestion failed");
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <>
      <div className="modal-scrim" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl border border-border/80 shadow-2xl w-full max-w-6xl h-[min(92vh,52rem)] max-h-[92vh] flex flex-col animate-fade-in overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {canEdit ? "Edit task" : "View task"}
              </p>
              <h2 className="truncate text-lg font-semibold text-foreground">{title.trim() || "Untitled task"}</h2>
              {!canEdit && (
                <p className="text-xs text-muted-foreground mt-0.5">You can update progress and status only.</p>
              )}
            </div>
            <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(18.5rem,24rem)] lg:overflow-hidden">
          <div className="space-y-4 p-4 lg:min-h-0 lg:overflow-y-auto">
            {task.requires_review && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Audit/review required before this task can be marked complete.
              </div>
            )}
            {task.status === "pending_review" && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/40">
                Pending Review
              </Badge>
            )}
            {task.review_note && (
              <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
                Review feedback: {task.review_note}
              </p>
            )}

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus disabled={!canEdit} />
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Description</Label>
                {canEdit && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11"
                      disabled={aiBusy !== null}
                      onClick={() => void runAssist("description")}
                    >
                      {aiBusy === "description" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      Improve
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11"
                      disabled={aiBusy !== null}
                      onClick={() => void runAssist("subtasks")}
                    >
                      {aiBusy === "subtasks" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      Suggest subtasks
                    </Button>
                  </div>
                )}
              </div>
              {canEdit ? (
                <>
                  <EntityLookupField
                    value={description}
                    onChange={setDescription}
                    rows={5}
                    excludeTaskId={task.id}
                    disabled={aiBusy === "description"}
                  />
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Improve and subtask suggestions use Muse Spark. That text may be used to improve Meta models.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 min-h-[4.5rem]">
                    {description || "—"}
                  </p>
                  <EntityLinkPreview text={description} className="mt-1" />
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Assign To *</Label>
                {canEdit ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start font-normal h-auto min-h-10 py-2">
                        {assignees.length === 0 ? (
                          <span className="text-muted-foreground">Select doer</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {assignees.map((id) => {
                              const u = users.find((x) => x.id === id);
                              return <Badge key={id} variant="secondary" className="text-xs">{assigneeName(id)}</Badge>;
                            })}
                          </div>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-64 overflow-y-auto" align="start">
                      <div className="p-2 space-y-1">
                        {users.map((u) => {
                          const checked = assignees.includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => {
                                  setAssignees((prev) => {
                                    const nextSel = c ? [...prev, u.id] : prev.filter((x) => x !== u.id);
                                    if (c && u.department_id) setDeptId(u.department_id);
                                    return nextSel;
                                  });
                                }}
                              />
                              <span className="text-sm">{u.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="flex flex-wrap gap-1 min-h-10 items-center">
                    {task.assignees.map((a) => (
                      <Badge key={a.user_id} variant="secondary" className="text-xs">{a.name}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                {canEdit ? (
                  <Select value={deptId} onValueChange={setDeptId}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={task.department_name || "—"} disabled />
                )}
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                {canEdit ? (
                  <Select
                    value={projectId || "none"}
                    onValueChange={(v) => {
                      const next = v === "none" ? "" : v;
                      setProjectId(next);
                      setSectionId((prev) => sectionIdForProject(prev, next || null, sections) || "");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="No project" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.icon} {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={task.project_name || "—"} disabled />
                )}
              </div>
              {projectId && (
                <div className="space-y-2">
                  <Label>Section</Label>
                  {canEdit ? (
                    <Select value={sectionId || "none"} onValueChange={(v) => setSectionId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="No section" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No section</SelectItem>
                        {sections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={task.section_name || "—"} disabled />
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-estimated-hours">Estimated hours</Label>
                {canEdit ? (
                  <Input
                    id="edit-estimated-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    value={estimatedHours}
                    onChange={(e) => setEstimatedHours(e.target.value)}
                  />
                ) : (
                  <Input value={task.estimated_hours != null ? String(task.estimated_hours) : "—"} disabled />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-logged-hours">Logged hours</Label>
                {canEdit ? (
                  <Input
                    id="edit-logged-hours"
                    type="number"
                    min="0"
                    step="0.5"
                    value={loggedHours}
                    onChange={(e) => setLoggedHours(e.target.value)}
                  />
                ) : (
                  <Input value={task.logged_hours != null ? String(task.logged_hours) : "—"} disabled />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              {canEdit ? (
                <div className="flex gap-2">
                  {priorities.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all",
                        priority === p ? priorityColorMap[p] : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >{p}</button>
                  ))}
                </div>
              ) : (
                <Input value={task.priority} disabled className="capitalize" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Due Date</Label>
                {canEdit ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                ) : (
                  <div className="space-y-2">
                    <Input value={displayDueDate || "—"} disabled />
                    {canExtendDue && task.status !== "done" && (
                      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowExtendDue(true)}>
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                        Extend due date
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s] || s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {extensionHistory.length > 0 && (
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-medium text-foreground">Due date extension history</p>
                {extensionHistory.map((e, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground border-t first:border-t-0 pt-2 first:pt-0">
                    <span className="font-mono-num">{e.old_due_date || "—"}</span>
                    {" → "}
                    <span className="font-mono-num text-foreground">{e.new_due_date}</span>
                    <span className="ml-1">· {e.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">One-time</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border p-3 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={requiresReview}
                      onCheckedChange={(c) => {
                        const on = !!c;
                        setRequiresReview(on);
                        if (!on) setReviewerUserId("");
                        else if (!reviewerUserId && user?.id) setReviewerUserId(user.id);
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">Requires Audit / Review Before Completion</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Assignee submits for review; you or the reviewer approves before completion.
                      </p>
                    </div>
                  </label>
                  {requiresReview && (
                    <div className="space-y-1.5 pl-6">
                      <Label>Reviewer</Label>
                      <Select value={reviewerUserId || user?.id || ""} onValueChange={setReviewerUserId}>
                        <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                        <SelectContent>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            {(showSubmitReview || showReviewActions) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {showSubmitReview && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setReviewMode("submit")}>
                    <Send className="h-3.5 w-3.5 mr-1.5" /> Submit for Review
                  </Button>
                )}
                {showReviewActions && (
                  <>
                    <Button type="button" size="sm" onClick={() => setReviewMode("approve")}>
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Approve
                    </Button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => setReviewMode("reject")}>
                      <XCircle className="h-3.5 w-3.5 mr-1.5" /> Reject
                    </Button>
                  </>
                )}
              </div>
            )}

            <SubtaskEditor
              subtasks={subtasks}
              onChange={(next) => {
                subtasksDirty.current = true;
                setSubtasks(next);
              }}
              disabled={saving || aiBusy === "subtasks"}
              showCompleted
            />

            <div className="pt-2 border-t">
              <TaskAttachments taskId={task.id} />
            </div>
          </div>
            <div className="flex min-h-[28rem] max-h-[32rem] flex-col border-t bg-muted/20 lg:max-h-none lg:min-h-0 lg:border-l lg:border-t-0">
              <TaskDiscussion
                taskId={task.id}
                currentUserId={user?.id ?? null}
                currentUserName={user?.profile?.name ?? null}
                fallbackParticipants={fallbackParticipants}
                taskTitle={title}
                taskDescription={description}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t bg-card px-4 py-3">
            <Button variant="outline" className="h-11" onClick={onClose}>Cancel</Button>
            <Button className="h-11" onClick={handleSave} disabled={saving || (canEdit && assignees.length === 0)}>
              {saving ? "Saving…" : canEdit ? "Save changes" : "Update status"}
            </Button>
          </div>
        </div>
      </div>

      {reviewMode && (
        <TaskReviewDialog
          open={!!reviewMode}
          onOpenChange={(o) => { if (!o) setReviewMode(null); }}
          task={task}
          mode={reviewMode}
          onDone={() => {
            setReviewMode(null);
            onSaved?.();
            onClose();
          }}
        />
      )}

      <ExtendTaskDueDateDialog
        task={{ ...task, due_date: displayDueDate }}
        open={showExtendDue}
        onOpenChange={setShowExtendDue}
        onExtended={(newDueDate) => {
          setDisplayDueDate(newDueDate);
          onSaved?.();
        }}
      />
    </>
  );
};

export default EditTaskModal;
