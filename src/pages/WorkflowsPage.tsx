import { useState, useEffect, useCallback, useRef } from "react";
import { GitBranch, Plus, Play, Edit, MoreHorizontal, Trash2, X, ChevronDown, ChevronRight, Paperclip, AlertCircle, CheckCircle2, Clock, GripVertical, GitFork, Flag, Search } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WorkflowHealth } from "@/components/WorkflowHealth";
import { ExtendWorkflowTatDialog } from "@/components/ExtendWorkflowTatDialog";
import { formatDateIST } from "@/lib/time";

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

interface SortableStageProps {
  stage: TemplateStage;
  index: number;
  allStages: TemplateStage[];
  departments: Department[];
  profiles: Profile[];
  onChange: (id: string, patch: Partial<TemplateStage>) => void;
  onRemove: (id: string) => void;
}

const SortableStage = ({ stage: s, index: i, allStages, departments, profiles, onChange, onRemove }: SortableStageProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const deptMembers = profiles.filter((p) => p.department_id === s.owner_department_id);
  // Other stages this branch can jump to
  const branchTargets = allStages.filter((x) => x.id !== s.id);
  return (
    <div ref={setNodeRef} style={style} className={`border rounded-lg p-3 space-y-2 bg-card ${s.is_decision ? "border-primary/40" : ""} ${s.is_terminal ? "border-success/40 bg-success/5" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground">Stage {i + 1}</span>
          {s.is_decision && <Badge variant="outline" className="text-[10px] gap-1"><GitFork className="h-2.5 w-2.5" />Decision</Badge>}
          {s.is_terminal && <Badge variant="outline" className="text-[10px] gap-1 border-success text-success"><Flag className="h-2.5 w-2.5" />End</Badge>}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(s.id)}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <Input value={s.name} onChange={(e) => onChange(s.id, { name: e.target.value })} placeholder="Stage name *" />

      {!s.is_terminal && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Select value={s.owner_department_id || "none"} onValueChange={(v) => onChange(s.id, { owner_department_id: v === "none" ? null : v, default_assignee_user_id: null })}>
              <SelectTrigger><SelectValue placeholder="Owner department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No default —</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={s.default_assignee_user_id || "any"}
              onValueChange={(v) => onChange(s.id, { default_assignee_user_id: v === "any" ? null : v })}
              disabled={!s.owner_department_id}
            >
              <SelectTrigger><SelectValue placeholder="Default team member" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any dept member</SelectItem>
                {deptMembers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              value={s.default_tat_hours}
              onChange={(e) => onChange(s.id, { default_tat_hours: parseInt(e.target.value) || 1 })}
              placeholder="TAT hours"
              className="w-32"
            />
            <span className="text-xs text-muted-foreground">hours TAT</span>
          </div>
          <Textarea value={s.description || ""} onChange={(e) => onChange(s.id, { description: e.target.value })} rows={2} placeholder="What happens in this stage" />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={s.escalate_on_breach}
              onChange={(e) => onChange(s.id, { escalate_on_breach: e.target.checked })}
              className="rounded"
            />
            <span className="text-muted-foreground">Escalate to MD/Admin if TAT is breached</span>
          </label>
        </>
      )}

      <div className="border-t pt-2 space-y-2">
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_decision}
              disabled={s.is_terminal}
              onChange={(e) => onChange(s.id, { is_decision: e.target.checked })}
              className="rounded"
            />
            <GitFork className="h-3 w-3" />
            <span className="text-muted-foreground">Decision (YES / NO branch)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_terminal}
              onChange={(e) => onChange(s.id, {
                is_terminal: e.target.checked,
                is_decision: e.target.checked ? false : s.is_decision,
                yes_next_position: e.target.checked ? null : s.yes_next_position,
                no_next_position: e.target.checked ? null : s.no_next_position,
              })}
              className="rounded"
            />
            <Flag className="h-3 w-3" />
            <span className="text-muted-foreground">End stage (workflow finishes here)</span>
          </label>
        </div>

        {s.is_terminal && (
          <Input
            value={s.outcome_label || ""}
            onChange={(e) => onChange(s.id, { outcome_label: e.target.value })}
            placeholder='Outcome label, e.g. "Successful" or "Unsuccessful"'
            className="h-8 text-xs"
          />
        )}

        {s.is_decision && !s.is_terminal && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-success">On YES → go to</Label>
              <Select
                value={s.yes_next_position?.toString() || "next"}
                onValueChange={(v) => onChange(s.id, { yes_next_position: v === "next" ? null : parseInt(v) })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">Next stage in order</SelectItem>
                  {branchTargets.map((t, idx) => {
                    const realPos = allStages.findIndex((x) => x.id === t.id) + 1;
                    return (
                      <SelectItem key={t.id} value={realPos.toString()}>
                        Stage {realPos}: {t.name || "(unnamed)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] text-destructive">On NO → go to</Label>
              <Select
                value={s.no_next_position?.toString() || "next"}
                onValueChange={(v) => onChange(s.id, { no_next_position: v === "next" ? null : parseInt(v) })}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="next">Next stage in order</SelectItem>
                  {branchTargets.map((t) => {
                    const realPos = allStages.findIndex((x) => x.id === t.id) + 1;
                    return (
                      <SelectItem key={t.id} value={realPos.toString()}>
                        Stage {realPos}: {t.name || "(unnamed)"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const WorkflowsPage = () => {
  const { user, isAdminOrMD, isDeptManager, managedDepartments } = useAuth();
  const canManageTemplates = isAdminOrMD || isDeptManager;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleStageDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTplStages((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, position: i + 1 }));
    });
  };

  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [activeTab, setActiveTab] = useState<"templates" | "workflows" | "health">("workflows");
  const [loading, setLoading] = useState(true);

  // Template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplCategory, setTplCategory] = useState("Operations");
  const [tplDescription, setTplDescription] = useState("");
  const [tplStages, setTplStages] = useState<TemplateStage[]>([]);
  const [tplFields, setTplFields] = useState<TemplateField[]>([]);

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

  const resetTemplateForm = () => {
    setEditingTemplate(null);
    setTplName(""); setTplCategory("Operations"); setTplDescription(""); setTplStages([]); setTplFields([]);
  };

  const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;
  const addTemplateField = () => setTplFields((p) => [...p, { position: p.length + 1, label: "", field_key: "", field_type: "text", required: false }]);
  const updateTplField = (idx: number, patch: Partial<TemplateField>) => setTplFields((p) => p.map((f, i) => i === idx ? { ...f, ...patch } : f));
  const removeTplField = (idx: number) => setTplFields((p) => p.filter((_, i) => i !== idx));

  const addTemplateStage = () => {
    setTplStages((prev) => [...prev, {
      id: crypto.randomUUID(),
      position: prev.length + 1,
      name: "",
      description: "",
      owner_department_id: null,
      default_assignee_user_id: null,
      default_tat_hours: 24,
      escalate_on_breach: true,
      is_decision: false,
      yes_next_position: null,
      no_next_position: null,
      is_terminal: false,
      outcome_label: null,
    }]);
  };

  const updateTplStage = (id: string, patch: Partial<TemplateStage>) => {
    setTplStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };
  const removeTplStage = (id: string) => {
    setTplStages((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i + 1 })));
  };

  const openEditTemplate = (t: Template) => {
    setEditingTemplate(t);
    setTplName(t.name);
    setTplCategory(t.category);
    setTplDescription(t.description || "");
    setTplStages(t.stages.map((s) => ({
      ...s,
      is_decision: !!s.is_decision,
      is_terminal: !!s.is_terminal,
      yes_next_position: s.yes_next_position ?? null,
      no_next_position: s.no_next_position ?? null,
      outcome_label: s.outcome_label ?? null,
    })));
    setTplFields((t.fields || []).map((f, i) => ({ ...f, position: i + 1 })));
    setShowTemplateModal(true);
  };

  const saveTemplate = async () => {
    if (!tplName.trim()) return toast.error("Name is required");
    if (tplStages.length === 0) return toast.error("Add at least one stage");
    if (tplStages.some((s) => !s.name.trim())) return toast.error("All stages need a name");
    if (tplStages.some((s) => s.is_terminal && !s.outcome_label?.trim())) {
      return toast.error("End stages need an outcome label (e.g. Successful)");
    }

    const rows = tplStages.map((s, i) => ({
      position: i + 1,
      name: s.name,
      description: s.description,
      owner_department_id: s.is_terminal ? null : s.owner_department_id,
      default_assignee_user_id: s.is_terminal ? null : s.default_assignee_user_id,
      default_tat_hours: s.default_tat_hours,
      escalate_on_breach: s.escalate_on_breach,
      is_decision: s.is_decision,
      yes_next_position: s.is_decision ? s.yes_next_position : null,
      no_next_position: s.is_decision ? s.no_next_position : null,
      is_terminal: s.is_terminal,
      outcome_label: s.is_terminal ? s.outcome_label : null,
    }));

    // Build field rows with auto-generated keys for any blank ones
    const seenKeys = new Set<string>();
    const fieldRows = tplFields
      .filter((f) => f.label.trim())
      .map((f, i) => {
        let key = (f.field_key || slugify(f.label)).trim();
        if (!key) key = slugify(f.label);
        let unique = key, n = 1;
        while (seenKeys.has(unique)) { unique = `${key}_${++n}`; }
        seenKeys.add(unique);
        return {
          position: i + 1,
          label: f.label.trim(),
          field_key: unique,
          field_type: f.field_type,
          required: f.required,
        };
      });

    let templateId = editingTemplate?.id;
    if (editingTemplate) {
      await supabase.from("workflow_templates").update({
        name: tplName, category: tplCategory, description: tplDescription,
      }).eq("id", editingTemplate.id);
      await supabase.from("workflow_template_stages").delete().eq("template_id", editingTemplate.id);
      await supabase.from("workflow_template_stages").insert(rows.map((r) => ({ ...r, template_id: editingTemplate.id })));
      toast.success("Template updated");
    } else {
      const { data, error } = await supabase.from("workflow_templates").insert({
        name: tplName, category: tplCategory, description: tplDescription,
        created_by: user?.id,
      }).select().single();
      if (error || !data) return toast.error(error?.message || "Failed to create");
      templateId = data.id;
      await supabase.from("workflow_template_stages").insert(rows.map((r) => ({ ...r, template_id: data.id })));
      toast.success("Template created");
    }
    if (templateId) {
      await supabase.from("workflow_template_fields").delete().eq("template_id", templateId);
      if (fieldRows.length > 0) {
        await supabase.from("workflow_template_fields").insert(fieldRows.map((r) => ({ ...r, template_id: templateId })));
      }
    }
    setShowTemplateModal(false);
    resetTemplateForm();
    fetchAll();
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
    try { new URL(newAttUrl); } catch { return toast.error("Invalid URL"); }
    setStageAttachments((prev) => [...prev, { label: newAttLabel.trim(), url: newAttUrl.trim() }]);
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
  return (
    <div className="p-6 max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Workflows</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            End-to-end process tracking — procurement, QC, production handoff, and more.
          </p>
        </div>
        {canManageTemplates && (
          <Button size="sm" onClick={() => { resetTemplateForm(); setShowTemplateModal(true); }}>
            <Plus className="h-4 w-4 mr-1" />Create Template
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b">
        {(canManageTemplates ? (["workflows", "health", "templates"] as const) : (["workflows"] as const)).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors capitalize -mb-px border-b-2 ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "workflows"
              ? `Active (${visibleWorkflows.filter((w) => w.status === "active").length})`
              : tab === "health"
              ? "Health"
              : "Templates"}
          </button>
        ))}
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
            <div className="text-center py-16">
              <GitBranch className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-lg font-medium text-foreground">No workflow templates</p>
              <p className="text-sm text-muted-foreground mt-1">Create a template to standardize a recurring process</p>
              {canManageTemplates && (
                <Button className="mt-4" onClick={() => { resetTemplateForm(); setShowTemplateModal(true); }}>
                  <Plus className="h-4 w-4 mr-1" />Create Template
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((wf) => {
                const decisions = wf.stages.filter((s) => s.is_decision).length;
                const ends = wf.stages.filter((s) => s.is_terminal).length;
                return (
                  <div key={wf.id} className="bg-card rounded-lg border p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{wf.name}</h3>
                        <Badge variant="secondary" className="text-[10px] mt-1">{wf.category}</Badge>
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
                      <Play className="h-3 w-3 mr-1" />Raise / Launch
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
              <p className="text-muted-foreground">{wfSearch ? "No workflows match your search." : "No active workflows. Launch one from a template."}</p>
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

      {/* Template Create/Edit Modal */}
      <Dialog open={showTemplateModal} onOpenChange={(o) => { if (!o) { setShowTemplateModal(false); resetTemplateForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Workflow Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Recruitment Process" />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={tplCategory} onChange={(e) => setTplCategory(e.target.value)} placeholder="Operations" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={tplDescription} onChange={(e) => setTplDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-3">
              <div>
                <Label>Stages * (executed in order; mark Decision for YES/NO branches and End for outcomes)</Label>
                {tplStages.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">Drag the <GripVertical className="inline h-3 w-3" /> handle to reorder. Set <GitFork className="inline h-3 w-3" /> Decision to branch, or <Flag className="inline h-3 w-3" /> End to finish the workflow with an outcome.</p>
                )}
              </div>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStageDragEnd}>
                <SortableContext items={tplStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {tplStages.map((s, i) => (
                      <SortableStage
                        key={s.id}
                        stage={s}
                        index={i}
                        allStages={tplStages}
                        departments={departments}
                        profiles={profiles}
                        onChange={updateTplStage}
                        onRemove={removeTplStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {tplStages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 border-2 border-dashed rounded-lg">
                  No stages yet. Click below to add your first stage.
                </p>
              )}
              <button
                type="button"
                onClick={addTemplateStage}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 rounded-lg text-sm font-medium text-primary transition-colors"
              >
                <Plus className="h-4 w-4" />Add Stage
              </button>
            </div>

            {/* Custom fields per template */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Custom fields at launch</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Optional reference fields captured each time this workflow runs (e.g. Indent ID, Consignment No, PO Number).
                  </p>
                </div>
              </div>
              {tplFields.length > 0 && (
                <div className="space-y-2">
                  {tplFields.map((f, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_120px_auto_auto] gap-2 items-center border rounded-md p-2">
                      <Input
                        value={f.label}
                        onChange={(e) => updateTplField(idx, { label: e.target.value, field_key: f.field_key || slugify(e.target.value) })}
                        placeholder="Field label (e.g. Indent ID)"
                        className="h-8 text-xs"
                      />
                      <Select value={f.field_type} onValueChange={(v) => updateTplField(idx, { field_type: v as any })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
                        <input type="checkbox" checked={f.required} onChange={(e) => updateTplField(idx, { required: e.target.checked })} />
                        Required
                      </label>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTplField(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addTemplateField}
                className="w-full flex items-center justify-center gap-2 py-2 border border-dashed rounded-md text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                <Plus className="h-3 w-3" />Add custom field
              </button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTemplateModal(false); resetTemplateForm(); }}>Cancel</Button>
            <Button onClick={saveTemplate}>{editingTemplate ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Launch Modal */}
      <Dialog open={!!launchTemplate} onOpenChange={(o) => !o && setLaunchTemplate(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raise Workflow: {launchTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchTemplate(null)}>Cancel</Button>
            <Button onClick={launchWorkflow}>Launch</Button>
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
                      <a href={a.url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex-1 truncate">{a.label}</a>
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
