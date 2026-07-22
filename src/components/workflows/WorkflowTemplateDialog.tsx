import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, GripVertical, GitFork, Flag, ChevronLeft, ChevronRight,
  Sparkles, CheckCircle2, Layers, FileText, ListChecks,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  WORKFLOW_TEMPLATE_PRESETS,
  blankTemplateStage,
  stagesFromPreset,
  fieldsFromPreset,
  type WorkflowTemplatePreset,
} from "@/lib/workflowTemplatePresets";

export type DeptOption = { id: string; name: string; color: string };
export type ProfileOption = { id: string; name: string; email: string; department_id: string | null };

export type TemplateStageForm = ReturnType<typeof blankTemplateStage>;
export type TemplateFieldForm = {
  id?: string;
  position: number;
  label: string;
  field_key: string;
  field_type: "text" | "number" | "date";
  required: boolean;
};

export type EditableTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  stages: TemplateStageForm[];
  fields: TemplateFieldForm[];
};

type StepId = "basics" | "stages" | "fields" | "review";

const STEPS: { id: StepId; label: string; icon: typeof FileText }[] = [
  { id: "basics", label: "Basics", icon: FileText },
  { id: "stages", label: "Stages", icon: Layers },
  { id: "fields", label: "Fields", icon: ListChecks },
  { id: "review", label: "Review", icon: CheckCircle2 },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;

function PipelinePreview({ stages }: { stages: TemplateStageForm[] }) {
  if (stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
        Add stages to preview the flow
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
      <div className="flex min-w-max items-center gap-1.5">
        {stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <div
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-[11px] font-medium max-w-[140px] truncate border",
                s.is_terminal
                  ? "border-success/40 bg-success/10 text-success"
                  : s.is_decision
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground",
              )}
              title={s.name || `Stage ${i + 1}`}
            >
              <span className="opacity-60 mr-1">{i + 1}.</span>
              {s.name || "Untitled"}
              {s.is_decision && <GitFork className="inline h-2.5 w-2.5 ml-1" />}
              {s.is_terminal && <Flag className="inline h-2.5 w-2.5 ml-1" />}
            </div>
            {i < stages.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SortableStageCard({
  stage: s,
  index: i,
  allStages,
  departments,
  profiles,
  onChange,
  onRemove,
}: {
  stage: TemplateStageForm;
  index: number;
  allStages: TemplateStageForm[];
  departments: DeptOption[];
  profiles: ProfileOption[];
  onChange: (id: string, patch: Partial<TemplateStageForm>) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const deptMembers = profiles.filter((p) => p.department_id === s.owner_department_id);
  const branchTargets = allStages.filter((x) => x.id !== s.id);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card p-3.5 space-y-3 shadow-sm",
        s.is_decision && "border-primary/35",
        s.is_terminal && "border-success/35 bg-success/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground shrink-0"
            {...attributes}
            {...listeners}
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground shrink-0">Stage {i + 1}</span>
          {s.is_decision && (
            <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
              <GitFork className="h-2.5 w-2.5" />Decision
            </Badge>
          )}
          {s.is_terminal && (
            <Badge variant="outline" className="text-[10px] gap-1 border-success text-success shrink-0">
              <Flag className="h-2.5 w-2.5" />End
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onRemove(s.id)}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Input
        value={s.name}
        onChange={(e) => onChange(s.id, { name: e.target.value })}
        placeholder="Stage name *"
        className="font-medium"
      />

      {!s.is_terminal && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select
              value={s.owner_department_id || "none"}
              onValueChange={(v) =>
                onChange(s.id, { owner_department_id: v === "none" ? null : v, default_assignee_user_id: null })
              }
            >
              <SelectTrigger><SelectValue placeholder="Owner department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Choose at launch —</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={s.default_assignee_user_id || "any"}
              onValueChange={(v) => onChange(s.id, { default_assignee_user_id: v === "any" ? null : v })}
              disabled={!s.owner_department_id}
            >
              <SelectTrigger><SelectValue placeholder="Default owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any dept member</SelectItem>
                {deptMembers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={1}
              value={s.default_tat_hours}
              onChange={(e) => onChange(s.id, { default_tat_hours: parseInt(e.target.value) || 1 })}
              className="w-28"
            />
            <span className="text-xs text-muted-foreground">hours TAT</span>
            <label className="flex items-center gap-2 text-xs cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={s.escalate_on_breach}
                onChange={(e) => onChange(s.id, { escalate_on_breach: e.target.checked })}
                className="rounded"
              />
              <span className="text-muted-foreground">Escalate if late</span>
            </label>
          </div>
          <Textarea
            value={s.description || ""}
            onChange={(e) => onChange(s.id, { description: e.target.value })}
            rows={2}
            placeholder="What should happen in this stage?"
          />
        </>
      )}

      <div className="border-t pt-2.5 space-y-2">
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_decision}
              disabled={s.is_terminal}
              onChange={(e) => onChange(s.id, { is_decision: e.target.checked })}
              className="rounded"
            />
            <GitFork className="h-3 w-3" />
            <span className="text-muted-foreground">Decision (YES / NO)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={s.is_terminal}
              onChange={(e) =>
                onChange(s.id, {
                  is_terminal: e.target.checked,
                  is_decision: e.target.checked ? false : s.is_decision,
                  yes_next_position: e.target.checked ? null : s.yes_next_position,
                  no_next_position: e.target.checked ? null : s.no_next_position,
                })
              }
              className="rounded"
            />
            <Flag className="h-3 w-3" />
            <span className="text-muted-foreground">End stage</span>
          </label>
        </div>

        {s.is_terminal && (
          <Input
            value={s.outcome_label || ""}
            onChange={(e) => onChange(s.id, { outcome_label: e.target.value })}
            placeholder='Outcome label — e.g. "Successful"'
            className="h-9 text-sm"
          />
        )}

        {s.is_decision && !s.is_terminal && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-success">On YES →</Label>
              <Select
                value={s.yes_next_position?.toString() || "next"}
                onValueChange={(v) => onChange(s.id, { yes_next_position: v === "next" ? null : parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
            <div className="space-y-1">
              <Label className="text-[11px] text-destructive">On NO →</Label>
              <Select
                value={s.no_next_position?.toString() || "next"}
                onValueChange={(v) => onChange(s.id, { no_next_position: v === "next" ? null : parseInt(v) })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: EditableTemplate | null;
  departments: DeptOption[];
  profiles: ProfileOption[];
  userId: string | undefined;
  onSaved: () => void;
};

export function WorkflowTemplateDialog({
  open,
  onOpenChange,
  editing,
  departments,
  profiles,
  userId,
  onSaved,
}: Props) {
  const [step, setStep] = useState<StepId>("basics");
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Operations");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<TemplateStageForm[]>([]);
  const [fields, setFields] = useState<TemplateFieldForm[]>([]);
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setStep("basics");
      setName(editing.name);
      setCategory(editing.category || "Operations");
      setDescription(editing.description || "");
      setStages(
        editing.stages.map((s) => ({
          ...blankTemplateStage(s.position),
          ...s,
          id: s.id || crypto.randomUUID(),
        })),
      );
      setFields((editing.fields || []).map((f, i) => ({ ...f, position: i + 1 })));
      setPickedPreset(null);
    } else {
      setStep("basics");
      setName("");
      setCategory("Operations");
      setDescription("");
      setStages([]);
      setFields([]);
      setPickedPreset(null);
    }
  }, [open, editing]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const applyPreset = (preset: WorkflowTemplatePreset) => {
    setPickedPreset(preset.id);
    setName(preset.name);
    setCategory(preset.category);
    setDescription(preset.description);
    setStages(stagesFromPreset(preset));
    setFields(fieldsFromPreset(preset));
    toast.success(`Loaded “${preset.name}” — customize stages next`);
    setStep("stages");
  };

  const addStage = () => setStages((prev) => [...prev, blankTemplateStage(prev.length + 1)]);
  const updateStage = (id: string, patch: Partial<TemplateStageForm>) =>
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const removeStage = (id: string) =>
    setStages((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, position: i + 1 })));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setStages((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({ ...s, position: i + 1 }));
    });
  };

  const addField = () =>
    setFields((p) => [...p, { position: p.length + 1, label: "", field_key: "", field_type: "text", required: false }]);
  const updateField = (idx: number, patch: Partial<TemplateFieldForm>) =>
    setFields((p) => p.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  const removeField = (idx: number) => setFields((p) => p.filter((_, i) => i !== idx));

  const validateBasics = () => {
    if (!name.trim()) {
      toast.error("Give the template a name");
      return false;
    }
    return true;
  };

  const validateStages = () => {
    if (stages.length === 0) {
      toast.error("Add at least one stage");
      return false;
    }
    if (stages.some((s) => !s.name.trim())) {
      toast.error("Every stage needs a name");
      return false;
    }
    if (stages.some((s) => s.is_terminal && !s.outcome_label?.trim())) {
      toast.error("End stages need an outcome label (e.g. Successful)");
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (step === "basics" && !validateBasics()) return;
    if (step === "stages" && !validateStages()) return;
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  };

  const save = async () => {
    if (!validateBasics() || !validateStages()) {
      setStep(!name.trim() ? "basics" : "stages");
      return;
    }
    setSaving(true);
    try {
      const rows = stages.map((s, i) => ({
        position: i + 1,
        name: s.name.trim(),
        description: s.description || null,
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

      const seenKeys = new Set<string>();
      const fieldRows = fields
        .filter((f) => f.label.trim())
        .map((f, i) => {
          let key = (f.field_key || slugify(f.label)).trim();
          if (!key) key = slugify(f.label);
          let unique = key;
          let n = 1;
          while (seenKeys.has(unique)) unique = `${key}_${++n}`;
          seenKeys.add(unique);
          return {
            position: i + 1,
            label: f.label.trim(),
            field_key: unique,
            field_type: f.field_type,
            required: f.required,
          };
        });

      let templateId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("workflow_templates")
          .update({ name: name.trim(), category, description: description || null })
          .eq("id", editing.id);
        if (error) throw error;
        await supabase.from("workflow_template_stages").delete().eq("template_id", editing.id);
        await supabase
          .from("workflow_template_stages")
          .insert(rows.map((r) => ({ ...r, template_id: editing.id })));
        toast.success("Template updated");
      } else {
        const { data, error } = await supabase
          .from("workflow_templates")
          .insert({
            name: name.trim(),
            category,
            description: description || null,
            created_by: userId,
          })
          .select()
          .single();
        if (error || !data) throw new Error(error?.message || "Failed to create");
        templateId = data.id;
        await supabase
          .from("workflow_template_stages")
          .insert(rows.map((r) => ({ ...r, template_id: data.id })));
        toast.success("Template created");
      }

      if (templateId) {
        await supabase.from("workflow_template_fields").delete().eq("template_id", templateId);
        if (fieldRows.length > 0) {
          await supabase
            .from("workflow_template_fields")
            .insert(fieldRows.map((r) => ({ ...r, template_id: templateId })));
        }
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setSaving(false);
    }
  };

  const progress = ((stepIndex + 1) / STEPS.length) * 100;
  const workStages = useMemo(() => stages.filter((s) => !s.is_terminal).length, [stages]);
  const decisionCount = useMemo(() => stages.filter((s) => s.is_decision).length, [stages]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="relative overflow-hidden border-b px-6 pt-5 pb-4">
          <div
            className="pointer-events-none absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 0% 0%, hsl(var(--primary) / 0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 0%, hsl(142 71% 45% / 0.08), transparent 50%)",
            }}
          />
          <DialogHeader className="relative space-y-1">
            <DialogTitle className="font-display text-xl tracking-tight">
              {editing ? "Edit workflow template" : "Create workflow template"}
            </DialogTitle>
            <DialogDescription>
              Design a reusable multi-stage process — then raise instances with one click.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-4">
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 flex gap-1">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const active = s.id === step;
                const done = i < stepIndex;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (i <= stepIndex || (i === 1 && validateBasics()) || i < stepIndex) setStep(s.id);
                      else if (i > stepIndex) {
                        if (step === "basics" && !validateBasics()) return;
                        if (i >= 2 && stepIndex < 1 && !validateBasics()) return;
                        if (i >= 2 && !validateStages() && stepIndex >= 1) return;
                        setStep(s.id);
                      }
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] sm:text-xs font-medium transition-colors",
                      active && "bg-primary text-primary-foreground shadow-sm",
                      done && !active && "bg-primary/10 text-primary",
                      !active && !done && "text-muted-foreground hover:bg-muted/80",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{s.label}</span>
                    <span className="sm:hidden">{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {step === "basics" && (
            <div className="space-y-5 animate-in fade-in-0 slide-in-from-right-2 duration-200">
              {!editing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <Label className="text-sm">Start from a blueprint</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pick a common process — stages and fields are filled in. You can edit everything after.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {WORKFLOW_TEMPLATE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={cn(
                          "text-left rounded-xl border p-3 transition-all hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          pickedPreset === p.id && "border-primary bg-primary/[0.06] ring-1 ring-primary/30",
                        )}
                      >
                        <p className="text-sm font-semibold text-foreground leading-snug">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{p.blurb}</p>
                        <Badge variant="secondary" className="mt-2 text-[10px]">{p.category}</Badge>
                      </button>
                    ))}
                  </div>
                  <div className="relative py-1">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/70" /></div>
                    <div className="relative flex justify-center">
                      <span className="bg-background px-2 text-[11px] text-muted-foreground">or start blank</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Template name *</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Purchase Approval"
                    className="h-11 text-base"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Operations"
                    list="wf-categories"
                  />
                  <datalist id="wf-categories">
                    <option value="Operations" />
                    <option value="Procurement" />
                    <option value="HR" />
                    <option value="Finance" />
                    <option value="Quality" />
                  </datalist>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="When should teams use this workflow?"
                  />
                </div>
              </div>
            </div>
          )}

          {step === "stages" && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
              <div>
                <Label className="text-sm">Build the pipeline *</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Drag to reorder. Mark <GitFork className="inline h-3 w-3" /> Decision for YES/NO branches, or{" "}
                  <Flag className="inline h-3 w-3" /> End when the process finishes.
                </p>
              </div>
              <PipelinePreview stages={stages} />
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {stages.map((s, i) => (
                      <SortableStageCard
                        key={s.id}
                        stage={s}
                        index={i}
                        allStages={stages}
                        departments={departments}
                        profiles={profiles}
                        onChange={updateStage}
                        onRemove={removeStage}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {stages.length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-border py-10 text-center space-y-3">
                  <Layers className="h-8 w-8 text-muted-foreground mx-auto opacity-60" />
                  <p className="text-sm text-muted-foreground">No stages yet</p>
                  <Button type="button" variant="outline" size="sm" onClick={addStage}>
                    <Plus className="h-4 w-4 mr-1" />Add first stage
                  </Button>
                </div>
              )}
              {stages.length > 0 && (
                <button
                  type="button"
                  onClick={addStage}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/35 hover:border-primary hover:bg-primary/5 rounded-xl text-sm font-medium text-primary transition-colors"
                >
                  <Plus className="h-4 w-4" />Add stage
                </button>
              )}
            </div>
          )}

          {step === "fields" && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
              <div>
                <Label className="text-sm">Launch fields (optional)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Captured every time someone raises this workflow — Indent ID, Lot no., Candidate name, etc.
                </p>
              </div>
              {fields.length === 0 ? (
                <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">
                  No custom fields — you can skip this step.
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((f, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto_auto] gap-2 items-center rounded-xl border bg-card p-2.5"
                    >
                      <Input
                        value={f.label}
                        onChange={(e) =>
                          updateField(idx, { label: e.target.value, field_key: f.field_key || slugify(e.target.value) })
                        }
                        placeholder="Field label"
                        className="h-9"
                      />
                      <Select
                        value={f.field_type}
                        onValueChange={(v) => updateField(idx, { field_type: v as TemplateFieldForm["field_type"] })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer px-1">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) => updateField(idx, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeField(idx)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addField}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />Add field
              </button>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-2 duration-200">
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  <p className="font-display text-lg font-semibold text-foreground">{name || "Untitled"}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Badge variant="secondary">{category || "Uncategorized"}</Badge>
                    <Badge variant="outline">{stages.length} stages</Badge>
                    <Badge variant="outline">{workStages} active</Badge>
                    {decisionCount > 0 && <Badge variant="outline">{decisionCount} decisions</Badge>}
                    {fields.filter((f) => f.label.trim()).length > 0 && (
                      <Badge variant="outline">{fields.filter((f) => f.label.trim()).length} fields</Badge>
                    )}
                  </div>
                  {description && <p className="text-sm text-muted-foreground mt-2">{description}</p>}
                </div>
                <PipelinePreview stages={stages} />
              </div>
              <ul className="space-y-2 text-sm">
                {stages.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-2 text-muted-foreground">
                    <span className="font-mono-num text-xs mt-0.5 w-5 shrink-0 text-foreground/70">{i + 1}.</span>
                    <span className="text-foreground font-medium">{s.name}</span>
                    {s.is_decision && <GitFork className="h-3.5 w-3.5 text-primary mt-0.5" />}
                    {s.is_terminal && (
                      <span className="text-success text-xs mt-0.5">→ {s.outcome_label}</span>
                    )}
                    {!s.is_terminal && (
                      <span className="text-xs mt-0.5">· {s.default_tat_hours}h TAT</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <div className="flex-1" />
          {stepIndex > 0 && (
            <Button variant="outline" onClick={goBack} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" />Back
            </Button>
          )}
          {step !== "review" ? (
            <Button onClick={goNext}>
              Continue <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => void save()} disabled={saving} className="min-w-[140px]">
              {saving ? "Saving…" : editing ? "Save changes" : "Create template"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
