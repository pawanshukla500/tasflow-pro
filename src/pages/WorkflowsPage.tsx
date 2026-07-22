import { useState, useEffect, useCallback, useRef } from "react";
import {
  GitBranch, Plus, Play, Edit, MoreHorizontal, Trash2, X, ChevronDown, ChevronRight,
  Paperclip, AlertCircle, CheckCircle2, Clock, GitFork, Flag, Search, Activity, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WorkflowHealth } from "@/components/WorkflowHealth";
import { ExtendWorkflowTatDialog } from "@/components/ExtendWorkflowTatDialog";
import { WorkflowTemplateDialog, type EditableTemplate } from "@/components/workflows/WorkflowTemplateDialog";
import { PageHeader } from "@/components/PageHeader";
import { formatDateIST } from "@/lib/time";
import { safeExternalUrl } from "@/lib/safeUrl";
import { cn } from "@/lib/utils";

interface Department { id: string; name: string; color: string; }
interface Profile { id: string; name: string; email: string; department_id: string | null; }

interface TemplateStage {
  id: string;
  position: number;
  name: string;
  description: string | null;
  owner_department_id: string | null;
  default_assignee_user_id: string | null;
  default_tat_hours: number;
  escalate_on_breach: boolean;
  is_decision: boolean;
  yes_next_position: number | null;
  no_next_position: number | null;
  is_terminal: boolean;
  outcome_label: string | null;
}
interface TemplateField {
  id?: string;
  position: number;
  label: string;
  field_key: string;
  field_type: "text" | "number" | "date";
  required: boolean;
}
interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  active: boolean;
  stages: TemplateStage[];
  fields: TemplateField[];
}
interface FieldValue { field_key: string; label: string; value: string | null; }

interface Attachment { label: string; url: string; }
interface WorkflowStage {
  id: string;
  workflow_id: string;
  position: number;
  name: string;
  owner_department_id: string | null;
  assignee_user_id: string | null;
  tat_hours: number;
  escalate_on_breach: boolean;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  attachments: Attachment[];
  is_decision: boolean;
  yes_next_position: number | null;
  no_next_position: number | null;
  is_terminal: boolean;
  outcome_label: string | null;
  decision: string | null;
}
interface Workflow {
  id: string;
  template_id: string | null;
  title: string;
  description: string | null;
  status: string;
  current_stage_position: number;
  raised_by: string | null;
  priority: string;
  tracking_number?: string | null;
  created_at: string;
  outcome_label: string | null;
  stages: WorkflowStage[];
  fieldValues: FieldValue[];
}

const isOverdue = (s: WorkflowStage) => {
  if (s.status !== "in_progress" || !s.started_at) return false;
  const elapsedMs = Date.now() - new Date(s.started_at).getTime();
  return elapsedMs > s.tat_hours * 3600 * 1000;
};

const stageDeadline = (s: WorkflowStage) => {
  if (!s.started_at) return null;
  return new Date(new Date(s.started_at).getTime() + s.tat_hours * 3600 * 1000);
};

const WorkflowsPage = () => {
  const { user, isAdminOrMD, isDeptManager, managedDepartments } = useAuth();
  const canManageTemplates = isAdminOrMD || isDeptManager;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeTab, setActiveTab] = useState<"templates" | "workflows" | "health">("workflows");
  const [loading, setLoading] = useState(true);

  // Template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditableTemplate | null>(null);
  const [showRaisePicker, setShowRaisePicker] = useState(false);

  // Launch modal
  const [launchTemplate, setLaunchTemplate] = useState<Template | null>(null);
  const [wfTitle, setWfTitle] = useState("");
  const [wfDescription, setWfDescription] = useState("");
  const [wfPriority, setWfPriority] = useState("medium");
  const [launchStages, setLaunchStages] = useState<Array<TemplateStage & { assignee_user_id: string | null }>>([]);
  const [launchFieldValues, setLaunchFieldValues] = useState<Record<string, string>>({});
  const [launchRefId, setLaunchRefId] = useState("");
  const [deleteWorkflowId, setDeleteWorkflowId] = useState<string | null>(null);
  const [wfSearch, setWfSearch] = useState("");

  // Stage detail
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [stageNotes, setStageNotes] = useState("");
  const [stageAttachments, setStageAttachments] = useState<Attachment[]>([]);
  const [stageDecision, setStageDecision] = useState<"yes" | "no" | null>(null);
  const [newAttLabel, setNewAttLabel] = useState("");
  const [newAttUrl, setNewAttUrl] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showExtendTat, setShowExtendTat] = useState(false);

  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [expandedWf, setExpandedWf] = useState<string | null>(null);
  const deepLinkHandled = useRef(false);

  const managedDeptIds = isDeptManager
    ? (managedDepartments?.length
      ? managedDepartments
      : user?.profile?.department_id
        ? [user.profile.department_id]
        : [])
    : [];

  const managesWorkflowDepartment = (deptId: string | null | undefined) =>
    !!deptId && managedDeptIds.includes(deptId);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [deptsRes, profRes, tplRes, tplStgRes, tplFldRes, wfRes, wfStgRes, wfValRes] = await Promise.all([
      supabase.from("departments").select("id, name, color").order("name"),
      supabase.from("profiles").select("id, name, email, department_id").eq("active", true).order("name"),
      supabase.from("workflow_templates").select("*").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("workflow_template_stages").select("*").order("position"),
      supabase.from("workflow_template_fields").select("*").order("position"),
      supabase.from("workflows").select("*").order("created_at", { ascending: false }),
      supabase.from("workflow_stages").select("*").order("position"),
      supabase.from("workflow_field_values").select("*"),
    ]);
    setDepartments(deptsRes.data || []);
    setProfiles(profRes.data || []);
    const tplStgs = (tplStgRes.data || []) as TemplateStage[];
    const tplFlds = (tplFldRes.data || []) as any[];
    setTemplates((tplRes.data || []).map((t: any) => ({
      ...t,
      stages: tplStgs.filter((s) => (s as any).template_id === t.id),
      fields: tplFlds.filter((f) => f.template_id === t.id) as TemplateField[],
    })));
    const wfStages = (wfStgRes.data || []).map((s: any) => ({
      ...s,
      attachments: Array.isArray(s.attachments) ? s.attachments : [],
    })) as WorkflowStage[];
    const wfVals = (wfValRes.data || []) as any[];
    setWorkflows((wfRes.data || []).map((w: any) => ({
      ...w,
      stages: wfStages.filter((s) => s.workflow_id === w.id),
      fieldValues: wfVals.filter((v) => v.workflow_id === w.id) as FieldValue[],
    })));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateModal(true);
  };

  const openEditTemplate = (t: Template) => {
    setEditingTemplate({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      stages: t.stages.map((s) => ({
        id: s.id,
        position: s.position,
        name: s.name,
        description: s.description || "",
        owner_department_id: s.owner_department_id,
        default_assignee_user_id: s.default_assignee_user_id,
        default_tat_hours: s.default_tat_hours,
        escalate_on_breach: s.escalate_on_breach,
        is_decision: !!s.is_decision,
        yes_next_position: s.yes_next_position ?? null,
        no_next_position: s.no_next_position ?? null,
        is_terminal: !!s.is_terminal,
        outcome_label: s.outcome_label ?? null,
      })),
      fields: (t.fields || []).map((f, i) => ({ ...f, position: i + 1 })),
    });
    setShowTemplateModal(true);
  };

    const deleteTemplate = async () => {
    if (!deleteTemplateId) return;
    const { error } = await supabase.from("workflow_templates").delete().eq("id", deleteTemplateId);
    if (error) return toast.error(error.message);
    toast.success("Template deleted");
    setDeleteTemplateId(null);
    fetchAll();
  };

  const openLaunch = (t: Template) => {
    setLaunchTemplate(t);
    setWfTitle(t.name);
    setWfDescription("");
    setWfPriority("medium");
    setLaunchRefId("");
    setLaunchStages(t.stages.map((s) => ({ ...s, assignee_user_id: s.default_assignee_user_id })));
    const init: Record<string, string> = {};
    (t.fields || []).forEach((f) => { init[f.field_key] = ""; });
    setLaunchFieldValues(init);
  };

  const launchWorkflow = async () => {
    if (!launchTemplate || !wfTitle.trim()) return toast.error("Title is required");
    if (launchStages.some((s) => !s.is_terminal && !s.owner_department_id)) {
      return toast.error("Every non-end stage needs an owner department");
    }
    const missing = (launchTemplate.fields || []).find((f) => f.required && !(launchFieldValues[f.field_key] || "").trim());
    if (missing) return toast.error(`${missing.label} is required`);

    const { data: wf, error } = await supabase.from("workflows").insert({
      template_id: launchTemplate.id,
      title: wfTitle,
      description: wfDescription,
      priority: wfPriority,
      raised_by: user?.id,
      raised_by_department_id: user?.profile?.department_id || null,
      current_stage_position: 1,
      status: "active",
    }).select().single();
    if (error || !wf) return toast.error(error?.message || "Failed");

    const stageRows = launchStages.map((s, i) => ({
      workflow_id: wf.id,
      position: i + 1,
      name: s.name,
      owner_department_id: s.is_terminal ? null : s.owner_department_id,
      assignee_user_id: s.is_terminal ? null : s.assignee_user_id,
      tat_hours: s.default_tat_hours,
      escalate_on_breach: s.escalate_on_breach,
      status: i === 0 ? "in_progress" : "pending",
      started_at: i === 0 ? new Date().toISOString() : null,
      is_decision: s.is_decision,
      yes_next_position: s.is_decision ? s.yes_next_position : null,
      no_next_position: s.is_decision ? s.no_next_position : null,
      is_terminal: s.is_terminal,
      outcome_label: s.is_terminal ? s.outcome_label : null,
    }));
    const { data: insertedStages } = await supabase.from("workflow_stages").insert(stageRows).select();

    // Tracking number is auto-generated by DB (WF-YYYYMMDD-000001). Custom reference optional.
    const customRef = launchRefId.trim();
    const valueRows = (launchTemplate.fields || [])
      .filter((f) => f.field_key !== "reference_id" && (launchFieldValues[f.field_key] || "").trim())
      .map((f) => ({
        workflow_id: wf.id,
        field_key: f.field_key,
        label: f.label,
        value: launchFieldValues[f.field_key].trim(),
      }));
    if (valueRows.length > 0) {
      supabase.from("workflow_field_values").insert(valueRows).then(() => {});
    }
    if (customRef) {
      supabase.from("workflow_field_values")
        .update({ value: customRef, label: "Reference / Indent ID" })
        .eq("workflow_id", wf.id)
        .eq("field_key", "reference_id")
        .then(() => {});
    }

    const firstStage = (insertedStages || [])[0];
    if (firstStage) {
      notifyStageAssignee(wf as any, firstStage as any, false, "start").catch(() => {});
    }

    toast.success("Workflow launched");
    setLaunchTemplate(null);
    setActiveTab("workflows");
    fetchAll();
  };

  const deleteWorkflow = async () => {
    if (!deleteWorkflowId) return;
    const { error } = await supabase.rpc("delete_workflow_cascade" as any, { _workflow_id: deleteWorkflowId });
    if (error) return toast.error(error.message);
    toast.success("Workflow deleted");
    setDeleteWorkflowId(null);
    fetchAll();
  };


  const notifyStageAssignee = async (wf: Workflow, stage: WorkflowStage, isOverdueNotice: boolean, changeType: "start" | "advance" | "overdue" | "completed" | "rejected" = isOverdueNotice ? "overdue" : "advance") => {
    const { error } = await supabase.functions.invoke("notify-workflow-stage", {
      body: { workflowId: wf.id, stageId: stage.id, changeType },
    });
    if (error) console.warn("workflow team notify failed", error);
  };

  // Find or create a 1:1 DM and post a message into it (used to mirror notifications into Inbox chat)
  const postSystemDmMessage = async (fromUserId: string, toUserId: string, body: string) => {
    if (!user?.id) return;
    // Find existing DM between the two users that current user is also part of (must be participant to post)
    // Simplest: create a DM owned by current user with the recipient if missing
    const me = user.id;
    const other = me === toUserId ? fromUserId : toUserId;
    if (other === me) return;

    // Look for existing DM (not group) with exactly me + other
    const { data: myParts } = await supabase
      .from("conversation_participants").select("conversation_id").eq("user_id", me);
    const myConvoIds = (myParts || []).map((p: any) => p.conversation_id);
    let convoId: string | null = null;
    if (myConvoIds.length) {
      const { data: convos } = await supabase
        .from("conversations").select("id, is_group").in("id", myConvoIds).eq("is_group", false);
      const candidateIds = (convos || []).map((c: any) => c.id);
      if (candidateIds.length) {
        const { data: parts } = await supabase
          .from("conversation_participants").select("conversation_id, user_id").in("conversation_id", candidateIds);
        const grouped = new Map<string, string[]>();
        (parts || []).forEach((p: any) => {
          const arr = grouped.get(p.conversation_id) || [];
          arr.push(p.user_id);
          grouped.set(p.conversation_id, arr);
        });
        for (const [cid, users] of grouped) {
          if (users.length === 2 && users.includes(me) && users.includes(other)) { convoId = cid; break; }
        }
      }
    }

    if (!convoId) {
      const { data: convo, error } = await supabase.from("conversations").insert({
        is_group: false, title: null, created_by: me,
      }).select().single();
      if (error || !convo) return;
      convoId = convo.id;
      await supabase.from("conversation_participants").insert([
        { conversation_id: convoId, user_id: me },
        { conversation_id: convoId, user_id: other },
      ]);
    }

    await supabase.from("chat_messages").insert({
      conversation_id: convoId, sender_id: me, body,
    });
  };

  const openStage = (stage: WorkflowStage) => {
    setOpenStageId(stage.id);
    setStageNotes(stage.notes || "");
    setStageAttachments(stage.attachments || []);
    setStageDecision(null);
    setNewAttLabel(""); setNewAttUrl("");
  };

  const addAttachment = () => {
    if (!newAttLabel.trim() || !newAttUrl.trim()) return toast.error("Label and URL required");
    const safeUrl = safeExternalUrl(newAttUrl);
    if (!safeUrl) return toast.error("Only http(s) URLs are allowed");
    setStageAttachments((prev) => [...prev, { label: newAttLabel.trim().slice(0, 120), url: safeUrl }]);
    setNewAttLabel(""); setNewAttUrl("");
  };

  // Resolve which stage comes after `stage` for a given branch choice
  const resolveNextPosition = (wf: Workflow, stage: WorkflowStage, choice: "yes" | "no" | null): number | null => {
    if (stage.is_decision) {
      const target = choice === "yes" ? stage.yes_next_position : stage.no_next_position;
      if (target) return target;
    }
    // default: next stage in order that is not already completed
    const next = wf.stages.find((s) => s.position === stage.position + 1);
    return next ? next.position : null;
  };

  const saveStage = async (complete: boolean) => {
    if (!openStageId) return;
    const stage = workflows.flatMap((w) => w.stages).find((s) => s.id === openStageId);
    if (!stage) return;
    const wf = workflows.find((w) => w.id === stage.workflow_id);
    if (!wf) return;

    if (complete && stage.is_decision && !stageDecision) {
      return toast.error("Pick YES or NO for this decision");
    }

    const updates: any = {
      notes: stageNotes,
      attachments: stageAttachments,
    };
    if (complete) {
      updates.status = "completed";
      updates.completed_at = new Date().toISOString();
      updates.completed_by = user?.id;
      if (stage.is_decision) updates.decision = stageDecision;
    }
    const { error } = await supabase.from("workflow_stages").update(updates).eq("id", openStageId);
    if (error) return toast.error(error.message);

    if (complete) {
      const nextPos = resolveNextPosition(wf, stage, stageDecision);
      const nextStage = nextPos ? wf.stages.find((s) => s.position === nextPos) : null;

      // If next stage is a terminal/end stage, finish workflow with its outcome label
      if (nextStage?.is_terminal) {
        await supabase.from("workflow_stages").update({
          status: "completed",
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          completed_by: user?.id,
        }).eq("id", nextStage.id);
        await supabase.from("workflows").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          current_stage_position: nextStage.position,
          outcome_label: nextStage.outcome_label || "Completed",
        }).eq("id", wf.id);
        notifyStageAssignee(wf, nextStage, false, "completed").catch(() => {});
        toast.success(`Workflow ended: ${nextStage.outcome_label || "Completed"}`);
      } else if (nextStage) {
        await supabase.from("workflow_stages").update({
          status: "in_progress", started_at: new Date().toISOString(),
        }).eq("id", nextStage.id);
        await supabase.from("workflows").update({ current_stage_position: nextStage.position }).eq("id", wf.id);
        notifyStageAssignee(wf, { ...nextStage, started_at: new Date().toISOString() } as any, false).catch(() => {});
      } else {
        // No next stage at all — workflow complete
        await supabase.from("workflows").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          outcome_label: stage.is_decision ? (stageDecision === "yes" ? "Successful" : "Unsuccessful") : "Completed",
        }).eq("id", wf.id);
        const outcome = stage.is_decision ? (stageDecision === "yes" ? "completed" : "rejected") : "completed";
        notifyStageAssignee(wf, stage, false, outcome as "completed" | "rejected").catch(() => {});
        toast.success("Workflow completed 🎉");
      }
    } else {
      toast.success("Saved");
    }
    setOpenStageId(null);
    fetchAll();
  };

  // Visibility scope:
  // - Admin/MD: all workflows
  // - Dept manager: workflows that touch their department (or they raised)
  // - Employees: ONLY workflows where they are the explicit assignee on a stage (or raised it)
  const userScoped = isAdminOrMD ? workflows : workflows.filter((w) => {
    if (w.raised_by === user?.id) return true;
    return w.stages.some((s) => {
      if (s.assignee_user_id === user?.id) return true;
      if (isDeptManager && managesWorkflowDepartment(s.owner_department_id)) return true;
      return false;
    });
  });

  const visibleWorkflows = (() => {
    const q = wfSearch.trim().toLowerCase();
    if (!q) return userScoped;
    return userScoped.filter((w) => {
      if (w.title?.toLowerCase().includes(q)) return true;
      if (w.tracking_number?.toLowerCase().includes(q)) return true;
      if (w.description?.toLowerCase().includes(q)) return true;
      if (w.fieldValues?.some((v) => (v.value || "").toLowerCase().includes(q) || (v.label || "").toLowerCase().includes(q))) return true;
      const raiser = profiles.find((p) => p.id === w.raised_by)?.name?.toLowerCase() || "";
      if (raiser.includes(q)) return true;
      return false;
    });
  })();

  // Bottleneck snapshot for Active tab overview
  const activeWorkflows = userScoped.filter((w) => w.status === "active");
  const bottleneckStages = activeWorkflows.flatMap((w) =>
    w.stages
      .filter((s) => !s.is_terminal && s.status !== "completed" && isOverdue(s))
      .map((s) => ({ wf: w, stage: s }))
  );

  const stagesForUser = (wfStages: WorkflowStage[]) => {
    if (isAdminOrMD) return wfStages;
    return wfStages.filter((s) => {
      if (s.is_terminal) return false;
      if (s.assignee_user_id === user?.id) return true;
      if (isDeptManager && managesWorkflowDepartment(s.owner_department_id)) return true;
      return false;
    });
  };

  const workflowsForTab = activeTab === "workflows"
    ? visibleWorkflows.filter((w) => w.status === "active")
    : visibleWorkflows;

  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const wfParam = params.get("wf");
    if (!wfParam) return;

    const wf = workflows.find((w) => w.id === wfParam);
    if (!wf) return;

    deepLinkHandled.current = true;
    setActiveTab("workflows");
    setExpandedWf(wf.id);

    const stageParam = params.get("stage");
    if (stageParam) {
      const stage = wf.stages.find((s) => s.id === stageParam);
      if (stage) {
        setOpenStageId(stage.id);
        setStageNotes(stage.notes || "");
        setStageAttachments(stage.attachments || []);
      }
    }

    setTimeout(() => {
      document.getElementById(`wf-${wfParam}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  }, [loading, workflows]);

  const currentOpenStage = openStageId ? workflows.flatMap((w) => w.stages).find((s) => s.id === openStageId) : null;
  const currentOpenWorkflow = currentOpenStage
    ? workflows.find((w) => w.id === currentOpenStage.workflow_id)
    : null;
  const canExtendCurrentStage = !!currentOpenStage && (
    isAdminOrMD
    || currentOpenStage.assignee_user_id === user?.id
    || currentOpenWorkflow?.raised_by === user?.id
  ) && ["in_progress", "blocked"].includes(currentOpenStage.status);

  // Employees and managers both use scoped workflow visibility above.
  const activeCount = visibleWorkflows.filter((w) => w.status === "active").length;
  const tabs = canManageTemplates
    ? ([
        { id: "workflows" as const, label: "Active", count: activeCount, icon: GitBranch },
        { id: "health" as const, label: "Health", count: null, icon: Activity },
        { id: "templates" as const, label: "Templates", count: templates.length, icon: LayoutTemplate },
      ])
    : ([{ id: "workflows" as const, label: "Active", count: activeCount, icon: GitBranch }]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 0% 0%, hsl(var(--primary) / 0.14), transparent 55%), radial-gradient(ellipse 45% 60% at 100% 10%, hsl(142 71% 45% / 0.08), transparent 50%)",
          }}
        />
        <div className="relative p-5 md:p-6">
          <PageHeader
            className="mb-0"
            title="Workflows"
            description="Run multi-stage processes with owners, TAT, and yes/no decisions — from purchase approvals to QC handoff."
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-background/80"
                  onClick={() => {
                    if (templates.length === 0) {
                      if (canManageTemplates) {
                        setActiveTab("templates");
                        openCreateTemplate();
                      } else {
                        toast.info("Ask an admin to create a workflow template first");
                      }
                      return;
                    }
                    if (templates.length === 1) openLaunch(templates[0]);
                    else setShowRaisePicker(true);
                  }}
                >
                  <Play className="h-4 w-4 mr-1.5" />New workflow
                </Button>
                {canManageTemplates && (
                  <Button size="sm" onClick={openCreateTemplate}>
                    <Plus className="h-4 w-4 mr-1.5" />Create template
                  </Button>
                )}
              </div>
            }
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/50 w-fit max-w-full">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-background text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.count != null && (
                <span className={cn("font-mono-num text-[10px] opacity-70", active && "opacity-100")}>
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && activeTab === "health" && (
        <WorkflowHealth
          departments={departments}
          profiles={profiles}
          currentUserId={user?.id ?? null}
          isAdminOrMD={isAdminOrMD}
          onChanged={fetchAll}
        />
      )}

      {!loading && activeTab === "templates" && (
        <>
          {templates.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border border-dashed border-border/80 bg-muted/20">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LayoutTemplate className="h-6 w-6" />
              </div>
              <p className="font-display text-lg font-semibold text-foreground">No templates yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Templates are reusable blueprints — define stages once, then raise workflows anytime.
              </p>
              {canManageTemplates && (
                <Button className="mt-4" onClick={openCreateTemplate}>
                  <Plus className="h-4 w-4 mr-1" />Create template
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((wf) => {
                const decisions = wf.stages.filter((s) => s.is_decision).length;
                const ends = wf.stages.filter((s) => s.is_terminal).length;
                return (
                  <div key={wf.id} className="group bg-card rounded-2xl border border-border/70 p-4 hover:border-primary/30 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold font-display text-foreground">{wf.name}</h3>
                        <Badge variant="secondary" className="text-[10px] mt-1.5">{wf.category}</Badge>
                      </div>
                      {canManageTemplates && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditTemplate(wf)}><Edit className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTemplateId(wf.id)}>
                              <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {wf.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{wf.description}</p>}
                    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3" />{wf.stages.length} stages</span>
                      {decisions > 0 && <span className="inline-flex items-center gap-1"><GitFork className="h-3 w-3" />{decisions} decision{decisions > 1 ? "s" : ""}</span>}
                      {ends > 0 && <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" />{ends} end{ends > 1 ? "s" : ""}</span>}
                    </div>
                    <div className="mt-2 space-y-1">
                      {wf.stages.slice(0, 4).map((s, i) => {
                        const dept = departments.find((d) => d.id === s.owner_department_id);
                        return (
                          <div key={s.id} className="flex items-center justify-between text-[11px]">
                            <span className="text-foreground inline-flex items-center gap-1">
                              {s.is_decision && <GitFork className="h-2.5 w-2.5 text-primary" />}
                              {s.is_terminal && <Flag className="h-2.5 w-2.5 text-success" />}
                              {i + 1}. {s.name}
                            </span>
                            <span className="text-muted-foreground">{s.is_terminal ? (s.outcome_label || "End") : `${dept?.name || "—"} · ${s.default_tat_hours}h`}</span>
                          </div>
                        );
                      })}
                    </div>
                    <Button size="sm" className="w-full mt-4" onClick={() => openLaunch(wf)}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />Raise workflow
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && activeTab === "workflows" && (
        <>
          {/* Overview: search + bottleneck snapshot */}
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={wfSearch}
                onChange={(e) => setWfSearch(e.target.value)}
                placeholder="Search by tracking number (WF-…), title or raiser…"
                className="pl-8 h-9 text-sm"
              />
            </div>
            {bottleneckStages.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {bottleneckStages.length} bottleneck{bottleneckStages.length > 1 ? "s" : ""} — stages overdue
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {bottleneckStages.slice(0, 6).map(({ wf, stage }) => {
                    const ref = wf.fieldValues?.[0];
                    return (
                      <button
                        key={stage.id}
                        onClick={() => { setExpandedWf(wf.id); setWfSearch(""); }}
                        className="text-[11px] px-2 py-0.5 rounded bg-background border hover:bg-muted transition-colors"
                        title={`${wf.title} · ${stage.name}`}
                      >
                        <span className="font-medium">{ref ? `${ref.value}` : wf.title}</span>
                        <span className="text-muted-foreground"> · {stage.name}</span>
                      </button>
                    );
                  })}
                  {bottleneckStages.length > 6 && (
                    <span className="text-[11px] text-muted-foreground self-center">+{bottleneckStages.length - 6} more</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {workflowsForTab.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">
                {wfSearch
                  ? "No workflows match your search."
                  : "No active workflows yet. Raise one from a template to track a multi-stage process."}
              </p>
              {!wfSearch && (
                <Button
                  className="mt-4"
                  onClick={() => {
                    if (templates.length === 0) {
                      if (canManageTemplates) {
                        setActiveTab("templates");
                        openCreateTemplate();
                      } else toast.info("Ask an admin to create a template first");
                      return;
                    }
                    if (templates.length === 1) openLaunch(templates[0]);
                    else setShowRaisePicker(true);
                  }}
                >
                  <Play className="h-4 w-4 mr-1.5" />Raise workflow
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-lg border divide-y">
              {workflowsForTab.map((wf) => {
                const expanded = expandedWf === wf.id;
                const overdueCount = wf.stages.filter(isOverdue).length;
                const completedCount = wf.stages.filter((s) => s.status === "completed").length;
                const totalActionable = wf.stages.filter((s) => !s.is_terminal).length || wf.stages.length;
                const isUnsuccessful = wf.outcome_label?.toLowerCase().includes("unsuccess");
                return (
                  <div key={wf.id} id={`wf-${wf.id}`}>
                    <div className="w-full px-4 py-3 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <button
                        type="button"
                        onClick={() => setExpandedWf(expanded ? null : wf.id)}
                        className="flex items-center gap-4 flex-1 min-w-0 text-left"
                      >
                        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const trackNo = wf.tracking_number
                                || wf.fieldValues?.find((v) => v.field_key === "reference_id")?.value;
                              return trackNo ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono text-[11px] tracking-tight">
                                  {trackNo}
                                </span>
                              ) : null;
                            })()}
                            <p className="text-sm font-medium text-foreground truncate">{wf.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            Stage {wf.current_stage_position}/{wf.stages.length} ·{" "}
                            {profiles.find((p) => p.id === wf.raised_by)?.name || "Unknown"} ·{" "}
                            {formatDateIST(wf.created_at, { day: "numeric", month: "short", year: "numeric" })}
                            {wf.fieldValues?.filter((v) => v.field_key !== "reference_id").slice(0, 2).length > 0 && (
                              <>
                                {" · "}
                                {wf.fieldValues
                                  .filter((v) => v.field_key !== "reference_id")
                                  .slice(0, 2)
                                  .map((v) => `${v.label}: ${v.value}`)
                                  .join(" · ")}
                              </>
                            )}
                          </p>
                        </div>
                      </button>
                      {wf.status === "completed" && wf.outcome_label && (
                        <Badge variant="outline" className={`text-[10px] gap-1 ${isUnsuccessful ? "border-destructive text-destructive" : "border-success text-success"}`}>
                          <Flag className="h-3 w-3" />{wf.outcome_label}
                        </Badge>
                      )}
                      {overdueCount > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-1" />{overdueCount} overdue
                        </Badge>
                      )}
                      <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(completedCount / Math.max(totalActionable, 1)) * 100}%` }} />
                      </div>
                      <Badge variant="outline" className={`text-[10px] capitalize ${
                        wf.status === "completed" ? "border-success text-success" : ""
                      }`}>{wf.status}</Badge>
                      {isAdminOrMD && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => { e.stopPropagation(); setDeleteWorkflowId(wf.id); }}
                          title="Delete workflow"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {expanded && (
                      <div className="px-8 pb-4 space-y-2">
                        {stagesForUser(wf.stages).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2">No stages assigned to you in this workflow.</p>
                        ) : stagesForUser(wf.stages).map((s) => {
                          const dept = departments.find((d) => d.id === s.owner_department_id);
                          const assignee = profiles.find((p) => p.id === s.assignee_user_id);
                          const overdue = isOverdue(s);
                          return (
                            <div key={s.id} className={`border rounded-md p-3 ${overdue ? "border-destructive/50 bg-destructive/5" : ""} ${s.is_decision ? "border-primary/30" : ""}`}>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                                    s.status === "completed" ? "bg-success text-success-foreground"
                                    : s.status === "in_progress" ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                  }`}>
                                    {s.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.position}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground inline-flex items-center gap-1.5">
                                      {s.name}
                                      {s.is_decision && <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1"><GitFork className="h-2 w-2" />Decision</Badge>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">
                                      {dept?.name || "—"}
                                      {assignee ? ` · ${assignee.name}` : " · any dept member"}
                                      {" · "}<Clock className="h-3 w-3 inline" /> {s.tat_hours}h TAT
                                      {overdue && <span className="text-destructive ml-1">· OVERDUE</span>}
                                      {s.decision && (
                                        <span className={`ml-1 font-semibold ${s.decision === "yes" ? "text-success" : "text-destructive"}`}>
                                          · Chose {s.decision.toUpperCase()}
                                        </span>
                                      )}
                                      {s.attachments?.length > 0 && <span> · <Paperclip className="h-3 w-3 inline" /> {s.attachments.length}</span>}
                                    </p>
                                  </div>
                                </div>
                                {s.status !== "completed" && (
                                  <Button size="sm" variant={s.status === "in_progress" ? "default" : "outline"}
                                    disabled={s.status === "pending"}
                                    onClick={() => openStage(s)}>
                                    {s.status === "in_progress" ? "Action" : "Waiting"}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <WorkflowTemplateDialog
        open={showTemplateModal}
        onOpenChange={setShowTemplateModal}
        editing={editingTemplate}
        departments={departments}
        profiles={profiles}
        userId={user?.id}
        onSaved={fetchAll}
      />

      <Dialog open={showRaisePicker} onOpenChange={setShowRaisePicker}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display">Raise a workflow</DialogTitle>
            <DialogDescription>Choose a template to start a new process instance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setShowRaisePicker(false);
                  openLaunch(t);
                }}
                className="w-full text-left rounded-xl border border-border/70 p-3 hover:border-primary/40 hover:bg-primary/[0.04] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                      {t.description || `${t.stages.length} stages · ${t.category}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{t.category}</Badge>
                </div>
              </button>
            ))}
          </div>
          {canManageTemplates && (
            <DialogFooter className="sm:justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowRaisePicker(false); openCreateTemplate(); }}>
                <Plus className="h-4 w-4 mr-1" />New template
              </Button>
              <Button variant="outline" onClick={() => setShowRaisePicker(false)}>Cancel</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Launch Modal */}
      <Dialog open={!!launchTemplate} onOpenChange={(o) => !o && setLaunchTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
          <div className="relative border-b px-6 pt-5 pb-4 overflow-hidden">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse 70% 80% at 0% 0%, hsl(var(--primary) / 0.12), transparent 55%)",
              }}
            />
            <DialogHeader className="relative space-y-1">
              <DialogTitle className="font-display text-xl tracking-tight">
                Raise: {launchTemplate?.name}
              </DialogTitle>
              <DialogDescription>
                Fill title and owners — stages will start from position 1 with TAT clocks.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="space-y-4 px-6 py-5 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={wfTitle} onChange={(e) => setWfTitle(e.target.value)} placeholder="e.g. Hiring – Junior Designer" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={wfPriority} onValueChange={setWfPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description / context</Label>
              <Textarea value={wfDescription} onChange={(e) => setWfDescription(e.target.value)} rows={2} placeholder="Quantity, supplier, plant, etc." />
            </div>

            <div className="space-y-2 border-t pt-3">
              <Label>Tracking number</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Auto-assigned on launch (format: WF-YYYYMMDD-000001). Searchable from the workflow dashboard and included in all emails.
              </p>
              <Input
                value={launchRefId}
                onChange={(e) => setLaunchRefId(e.target.value)}
                placeholder="Leave blank for auto — or enter external PO / consignment ref"
                className="h-9 font-mono text-xs"
              />
            </div>

            {(launchTemplate?.fields || []).length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <Label>Additional reference details</Label>
                <p className="text-[11px] text-muted-foreground -mt-1">Custom fields configured for this template.</p>
                <div className="grid grid-cols-2 gap-2">
                  {(launchTemplate!.fields || []).map((f) => (
                    <div key={f.field_key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {f.label}{f.required && <span className="text-destructive"> *</span>}
                      </Label>
                      <Input
                        type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                        value={launchFieldValues[f.field_key] || ""}
                        onChange={(e) => setLaunchFieldValues((p) => ({ ...p, [f.field_key]: e.target.value }))}
                        className="h-8 text-xs"
                        placeholder={f.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Confirm stage owners</Label>
              <p className="text-[11px] text-muted-foreground -mt-1">Pick the team member first — their department is selected automatically. End stages don't need an owner.</p>
              {launchStages.map((s, i) => {
                if (s.is_terminal) {
                  return (
                    <div key={s.id} className="border rounded-lg p-3 border-success/40 bg-success/5">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <Flag className="h-3 w-3 text-success" />
                        Stage {i + 1}: {s.name} <span className="text-muted-foreground font-normal">— ends workflow as "{s.outcome_label}"</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={s.id} className={`border rounded-lg p-3 space-y-2 ${s.is_decision ? "border-primary/40" : ""}`}>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      Stage {i + 1}: {s.name}
                      {s.is_decision && <Badge variant="outline" className="text-[9px] gap-0.5 h-4 px-1"><GitFork className="h-2 w-2" />Decision</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">
                          Team member *
                          {s.default_assignee_user_id && (
                            <span className="ml-1 text-primary">(template default)</span>
                          )}
                        </Label>
                        <Select value={s.assignee_user_id || ""} onValueChange={(v) => {
                          const picked = profiles.find((p) => p.id === v);
                          setLaunchStages((prev) => prev.map((x) => x.id === s.id ? {
                            ...x,
                            assignee_user_id: v,
                            owner_department_id: picked?.department_id || x.owner_department_id,
                          } : x));
                        }}>
                          <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
                          <SelectContent>
                            {profiles.map((p) => {
                              const dept = departments.find((d) => d.id === p.department_id);
                              return (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}{dept ? ` · ${dept.name}` : ""}{p.id === s.default_assignee_user_id ? " — default" : ""}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Department (auto)</Label>
                        <Select value={s.owner_department_id || ""} onValueChange={(v) => {
                          setLaunchStages((prev) => prev.map((x) => x.id === s.id ? { ...x, owner_department_id: v } : x));
                        }}>
                          <SelectTrigger><SelectValue placeholder="Auto from member" /></SelectTrigger>
                          <SelectContent>
                            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] text-muted-foreground">TAT</Label>
                      <Input type="number" min={1} value={s.default_tat_hours}
                        onChange={(e) => setLaunchStages((prev) => prev.map((x) => x.id === s.id ? { ...x, default_tat_hours: parseInt(e.target.value) || 1 } : x))}
                        className="h-7 w-24" />
                      <span className="text-[11px] text-muted-foreground">hours</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setLaunchTemplate(null)}>Cancel</Button>
            <Button onClick={launchWorkflow}>
              <Play className="h-4 w-4 mr-1.5" />Launch workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stage detail modal */}
      <Dialog open={!!openStageId} onOpenChange={(o) => !o && setOpenStageId(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Stage details
              {currentOpenStage?.is_decision && <Badge variant="outline" className="text-[10px] gap-1"><GitFork className="h-2.5 w-2.5" />Decision</Badge>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {currentOpenStage && (
              <div className={`rounded-lg border p-3 text-xs ${isOverdue(currentOpenStage) ? "border-destructive/40 bg-destructive/5" : "bg-muted/20"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">Stage deadline</p>
                    <p className="text-muted-foreground mt-0.5">
                      TAT: {currentOpenStage.tat_hours}h
                      {currentOpenStage.started_at && (
                        <> · Due by {stageDeadline(currentOpenStage)?.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</>
                      )}
                      {isOverdue(currentOpenStage) && <span className="text-destructive font-medium ml-1">· OVERDUE</span>}
                    </p>
                  </div>
                  {canExtendCurrentStage && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowExtendTat(true)}>
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      Extend
                    </Button>
                  )}
                </div>
              </div>
            )}
            {currentOpenStage?.is_decision && (
              <div className="border-2 border-primary/30 rounded-lg p-3 bg-primary/5 space-y-2">
                <Label className="text-xs font-semibold">Decision required to advance *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStageDecision("yes")}
                    className={`py-3 rounded-md border-2 text-sm font-semibold transition-all ${
                      stageDecision === "yes"
                        ? "border-success bg-success text-success-foreground"
                        : "border-border hover:border-success/50 text-foreground"
                    }`}
                  >
                    ✓ YES
                  </button>
                  <button
                    type="button"
                    onClick={() => setStageDecision("no")}
                    className={`py-3 rounded-md border-2 text-sm font-semibold transition-all ${
                      stageDecision === "no"
                        ? "border-destructive bg-destructive text-destructive-foreground"
                        : "border-border hover:border-destructive/50 text-foreground"
                    }`}
                  >
                    ✗ NO
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  YES → goes to {currentOpenStage.yes_next_position ? `stage ${currentOpenStage.yes_next_position}` : "next stage"}.
                  NO → goes to {currentOpenStage.no_next_position ? `stage ${currentOpenStage.no_next_position}` : "next stage"}.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes / handoff message</Label>
              <Textarea value={stageNotes} onChange={(e) => setStageNotes(e.target.value)} rows={4} placeholder="What was done, any issues, etc." />
            </div>
            <div className="space-y-2">
              <Label>Attachments (Google Drive upload or external link)</Label>
              {stageAttachments.length > 0 && (
                <div className="space-y-1">
                  {stageAttachments.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs border rounded p-2">
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                      <a href={safeExternalUrl(a.url) || undefined} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex-1 truncate">{a.label}</a>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setStageAttachments((p) => p.filter((_, idx) => idx !== i))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
                <Input value={newAttLabel} onChange={(e) => setNewAttLabel(e.target.value)} placeholder="Label (e.g. PO PDF)" />
                <Input value={newAttUrl} onChange={(e) => setNewAttUrl(e.target.value)} placeholder="https://..." />
                <Button variant="outline" size="sm" onClick={addAttachment}>Add link</Button>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="file"
                  disabled={uploadingFile}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploadingFile(true);
                    try {
                      const fd = new FormData();
                      fd.append("file", f);
                      fd.append("folder", "workflow-attachments");
                      const { data, error } = await supabase.functions.invoke("firebase-upload", { body: fd });
                      if (error) throw error;
                      if (!data?.url) throw new Error("Upload failed");
                      setStageAttachments((p) => [...p, { label: newAttLabel.trim() || data.name || f.name, url: data.url }]);
                      setNewAttLabel("");
                      toast.success("Uploaded");
                    } catch (err: any) {
                      toast.error(err?.message || "Upload failed");
                    } finally {
                      setUploadingFile(false);
                      e.target.value = "";
                    }
                  }}
                />
                {uploadingFile && <span className="text-xs text-muted-foreground">Uploading…</span>}
              </div>
              <p className="text-[10px] text-muted-foreground">Files upload to the configured Drive folder via service account. Set label first to name the link.</p>

            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => saveStage(false)}>Save Draft</Button>
            <Button onClick={() => saveStage(true)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />Mark Complete & Advance
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentOpenStage && currentOpenWorkflow && (
        <ExtendWorkflowTatDialog
          stageId={currentOpenStage.id}
          stageName={currentOpenStage.name}
          workflowTitle={currentOpenWorkflow.title}
          currentTatHours={currentOpenStage.tat_hours}
          maxHours={isAdminOrMD || currentOpenWorkflow.raised_by === user?.id ? 720 : 168}
          open={showExtendTat}
          onOpenChange={setShowExtendTat}
          onExtended={() => {
            fetchAll();
            setShowExtendTat(false);
          }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={(o) => !o && setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Existing workflow instances using it will keep working, but the template won't be available to launch new ones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteTemplate}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete workflow confirm */}
      <AlertDialog open={!!deleteWorkflowId} onOpenChange={(o) => !o && setDeleteWorkflowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workflow?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the workflow, all its stages, comments, attachments and reference fields. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteWorkflow}>Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkflowsPage;
