import { useState, useEffect, useRef, useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import {
  X, CalendarIcon, Paperclip, FileIcon, Loader2,
  Users, Search, ChevronDown, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import SubtaskEditor, { type SubtaskDraft } from "@/components/SubtaskEditor";

interface CreateTaskModalProps {
  onClose: () => void;
  onCreated?: () => void;
  initialStatus?: string;
}

type Priority = "critical" | "high" | "medium" | "low";

const priorities: Priority[] = ["critical", "high", "medium", "low"];
const priorityColorMap: Record<Priority, string> = {
  critical: "bg-destructive text-destructive-foreground shadow-sm",
  high: "bg-warning text-warning-foreground shadow-sm",
  medium: "bg-primary text-primary-foreground shadow-sm",
  low: "bg-success text-success-foreground shadow-sm",
};

interface DeptOption { id: string; name: string; }
interface UserOption { id: string; name: string; department_id: string | null; }

const CreateTaskModal = ({ onClose, onCreated, initialStatus }: CreateTaskModalProps) => {
  const { user } = useAuth();
  const [priority, setPriority] = useState<Priority>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [deptId, setDeptId] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [dueTime, setDueTime] = useState<string>("");
  const [status, setStatus] = useState(initialStatus || "todo");
  const [frequency, setFrequency] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [requiresReview, setRequiresReview] = useState(false);
  const [reviewerUserId, setReviewerUserId] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("profiles").select("id, name, department_id").eq("active", true).order("name"),
    ]).then(([d, u]) => {
      setDepartments(d.data || []);
      setUsers(u.data || []);
    });
  }, []);

  const assignableUsers = users;

  useEffect(() => {
    if (assignees.length === 0) return;
    const primary = assignableUsers.find((u) => u.id === assignees[0]);
    if (primary?.department_id) setDeptId(primary.department_id);
  }, [assignees, assignableUsers]);

  const filteredUsers = assignableUsers.filter((u) =>
    u.name.toLowerCase().includes(assigneeSearch.toLowerCase()),
  );

  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const nextWeek = useMemo(() => addDays(today, 7), [today]);

  const isSameDay = (a?: Date, b?: Date) =>
    !!a && !!b && format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");

  const duePreset = isSameDay(dueDate, today)
    ? "today"
    : isSameDay(dueDate, tomorrow)
      ? "tomorrow"
      : isSameDay(dueDate, nextWeek)
        ? "week"
        : dueDate
          ? "custom"
          : "none";

  const extrasCount = useMemo(() => {
    let n = 0;
    if (status !== (initialStatus || "todo")) n += 1;
    if (deptId) n += 1;
    if (frequency !== "none") n += 1;
    if (requiresReview) n += 1;
    if (subtasks.some((s) => s.title.trim())) n += 1;
    if (pendingFiles.length > 0) n += 1;
    if (dueTime) n += 1;
    return n;
  }, [status, initialStatus, deptId, frequency, requiresReview, subtasks, pendingFiles, dueTime]);

  const canCreate = title.trim().length > 0 && assignees.length > 0 && !saving;

  const handleCreate = async () => {
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
      const orgId = (user?.profile as { organization_id?: string | null } | undefined)?.organization_id;
      const { data: task, error } = await supabase.from("tasks").insert({
        title: title.trim(),
        description: description || null,
        priority,
        status,
        department_id: deptId || null,
        organization_id: orgId || null,
        due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
        due_time: dueTime || null,
        created_by: user?.id || null,
        frequency,
        requires_review: requiresReview,
        reviewer_user_id: requiresReview && reviewerUserId ? reviewerUserId : null,
      }).select("id").single();

      if (error) throw error;

      if (assignees.length > 0 && task) {
        const rows = assignees.map(uid => ({ task_id: task.id, user_id: uid }));
        const { error: assigneeError } = await supabase.from("task_assignees").insert(rows);
        if (assigneeError) {
          await supabase.from("tasks").delete().eq("id", task.id);
          throw assigneeError;
        }
        supabase.functions.invoke("notify-task-assigned", {
          body: {
            taskId: task.id,
            assigneeUserIds: assignees,
            assignedByName: user?.profile?.name || user?.email || "A teammate",
          },
        }).catch((e) => console.warn("notify-task-assigned failed", e));
      }

      const subtaskRows = subtasks
        .map((s) => s.title.trim())
        .filter(Boolean)
        .map((stTitle, position) => ({ task_id: task!.id, title: stTitle, position }));
      if (subtaskRows.length > 0) {
        const { error: subErr } = await supabase.from("task_subtasks").insert(subtaskRows);
        if (subErr) console.warn("Subtasks insert failed:", subErr.message);
      }

      if (pendingFiles.length > 0 && task) {
        const files = pendingFiles;
        const taskId = task.id;
        (async () => {
          for (const file of files) {
            try {
              const form = new FormData();
              form.append("file", file);
              form.append("folder", "task-attachments");
              const up = await invokeEdgeFunction<{ url?: string; path?: string }>("firebase-upload", { body: form });
              await supabase.from("task_attachments").insert({
                task_id: taskId,
                uploaded_by: user?.id,
                file_name: file.name,
                file_url: up.url,
                file_path: up.path,
                mime_type: file.type || null,
                size_bytes: file.size,
              });
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              toast.error(`Attachment "${file.name}" failed: ${message}`);
            }
          }
          window.dispatchEvent(new CustomEvent("task:created", { detail: { taskId } }));
        })();
      }

      toast.success("Task created");
      onCreated?.();
      onClose();
      if (!pendingFiles.length) {
        window.dispatchEvent(new CustomEvent("task:created", { detail: { taskId: task?.id } }));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create task";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCreate) {
      e.preventDefault();
      void handleCreate();
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground/25 backdrop-blur-[2px] z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div
          className="bg-card rounded-2xl border shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col animate-fade-in overflow-hidden"
          onKeyDown={onKeyDown}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-title"
        >
          <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
            <div className="min-w-0">
              <h2 id="create-task-title" className="text-lg font-bold text-foreground tracking-tight">
                New Task
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Title + assignee required · ⌘/Ctrl+Enter to create
              </p>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Essentials */}
            <div className="space-y-1.5">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="What needs to be done?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
                className="h-11 text-base font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional context or acceptance criteria…"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="resize-none min-h-[64px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assign to *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal h-auto min-h-11 py-2.5">
                    {assignees.length === 0 ? (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Select one or more people
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {assignees.map(id => {
                          const u = users.find(x => x.id === id);
                          return <Badge key={id} variant="secondary" className="text-xs">{u?.name || "Unknown"}</Badge>;
                        })}
                      </div>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0 max-h-72 overflow-hidden flex flex-col" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search team members…"
                        value={assigneeSearch}
                        onChange={(e) => setAssigneeSearch(e.target.value)}
                        className="pl-8 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto p-2 space-y-0.5 flex-1">
                    {filteredUsers.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2 py-3 text-center">No members found</p>
                    ) : filteredUsers.map(u => {
                      const checked = assignees.includes(u.id);
                      return (
                        <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
                          <Checkbox checked={checked} onCheckedChange={(c) => {
                            setAssignees(prev => {
                              const next = c ? [...prev, u.id] : prev.filter(x => x !== u.id);
                              if (c && u.department_id) setDeptId(u.department_id);
                              return next;
                            });
                          }} />
                          <span className="text-sm">{u.name}</span>
                          {checked && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: "today", label: "Today", date: today },
                    { id: "tomorrow", label: "Tomorrow", date: tomorrow },
                    { id: "week", label: "Next week", date: nextWeek },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDueDate(duePreset === preset.id ? undefined : preset.date)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                        duePreset === preset.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                          duePreset === "custom"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        <CalendarIcon className="h-3 w-3" />
                        {duePreset === "custom" && dueDate ? format(dueDate, "MMM d") : "Pick"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                      {dueDate && (
                        <div className="border-t p-2">
                          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setDueDate(undefined); setDueTime(""); }}>
                            Clear due date
                          </Button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Priority</Label>
                <div className="flex flex-wrap gap-1.5">
                  {priorities.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",
                        priority === p ? priorityColorMap[p] : "bg-background border text-muted-foreground hover:border-primary/30",
                      )}
                    >{p}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Progressive disclosure for secondary fields */}
            <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border bg-muted/20 px-3.5 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    More options
                    {extrasCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{extrasCount}</Badge>
                    )}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", moreOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Department</Label>
                    <Select value={deptId} onValueChange={setDeptId}>
                      <SelectTrigger><SelectValue placeholder="Auto from assignee" /></SelectTrigger>
                      <SelectContent>
                        {departments.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="pending_review">Pending Review</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time</Label>
                    <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
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
                </div>
                {frequency !== "none" && (
                  <p className="text-[11px] text-muted-foreground -mt-2">
                    A new task auto-creates each time this one is completed.
                  </p>
                )}

                <div className="rounded-lg border bg-background p-3 space-y-3">
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
                      <p className="text-sm font-medium">Requires review before completion</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Assignee submits for review; only the reviewer or creator can mark it done.
                      </p>
                    </div>
                  </label>
                  {requiresReview && (
                    <div className="space-y-1.5 pl-6">
                      <Label>Reviewer</Label>
                      <Select
                        value={reviewerUserId || user?.id || ""}
                        onValueChange={setReviewerUserId}
                      >
                        <SelectTrigger><SelectValue placeholder="Defaults to you" /></SelectTrigger>
                        <SelectContent>
                          {assignableUsers.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}{u.id === user?.id ? " (you)" : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border bg-background p-3">
                  <SubtaskEditor subtasks={subtasks} onChange={setSubtasks} disabled={saving} />
                </div>

                <div className="space-y-2 rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <Label>Attachments</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                      <Paperclip className="h-3.5 w-3.5 mr-1.5" /> Add files
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    />
                  </div>
                  {pendingFiles.length > 0 && (
                    <ul className="space-y-1.5">
                      {pendingFiles.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                          <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] text-muted-foreground">Files upload after the task is created.</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t bg-muted/30">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreate} className="min-w-[120px]">
              {saving ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Creating…</>) : "Create Task"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateTaskModal;
