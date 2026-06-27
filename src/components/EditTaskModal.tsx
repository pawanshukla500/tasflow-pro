import { useState, useEffect } from "react";
import { format } from "date-fns";
import { X, CalendarIcon, ShieldCheck, Send, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import SubtaskEditor, { type SubtaskDraft } from "@/components/SubtaskEditor";
import TaskReviewDialog from "@/components/TaskReviewDialog";
import { ExtendTaskDueDateDialog } from "@/components/ExtendTaskDueDateDialog";
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
  const [assignees, setAssignees] = useState<string[]>(task.assignees.map((a) => a.user_id));
  const [dueDate, setDueDate] = useState<Date | undefined>(task.due_date ? new Date(task.due_date) : undefined);
  const [frequency, setFrequency] = useState(task.frequency || "none");
  const [requiresReview, setRequiresReview] = useState(!!task.requires_review);
  const [reviewerUserId, setReviewerUserId] = useState(task.reviewer_user_id || "");
  const [saving, setSaving] = useState(false);
  const [reviewMode, setReviewMode] = useState<"submit" | "approve" | "reject" | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; department_id: string | null }[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [showExtendDue, setShowExtendDue] = useState(false);
  const [displayDueDate, setDisplayDueDate] = useState(task.due_date);
  const [extensionHistory, setExtensionHistory] = useState<
    { old_due_date: string | null; new_due_date: string; reason: string; created_at: string }[]
  >([]);

  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name"),
      supabase.from("task_subtasks").select("id, title, completed, position").eq("task_id", task.id).order("position"),
      supabase.from("task_due_date_events").select("old_due_date, new_due_date, reason, created_at").eq("task_id", task.id).order("created_at", { ascending: false }).limit(5),
    ]).then(([d, u, st, ext]) => {
      setDepartments(d.data || []);
      setUsers(u.data || []);
      setSubtasks((st.data || []).map((s) => ({ id: s.id, title: s.title, completed: s.completed })));
      setExtensionHistory(ext.data || []);
    });
  }, [task.id, displayDueDate]);

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
      };
      if (status === "done" && !task.completed_at) updates.completed_at = new Date().toISOString();
      if (status !== "done") updates.completed_at = null;

      const { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
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

  return (
    <>
      <div className="fixed inset-0 bg-foreground/20 z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-lg border shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{canEdit ? "Edit Task" : "View Task"}</h2>
              {!canEdit && (
                <p className="text-xs text-muted-foreground mt-0.5">You can update progress and status only.</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <Label>Description</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEdit} />
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
                              return <Badge key={id} variant="secondary" className="text-xs">{u?.name || "Unknown"}</Badge>;
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
              onChange={setSubtasks}
              disabled={saving}
              showCompleted
            />

            <div className="pt-2 border-t">
              <TaskAttachments taskId={task.id} />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 p-4 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || (canEdit && assignees.length === 0)}>
              {saving ? "Saving…" : canEdit ? "Save Changes" : "Update Status"}
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
