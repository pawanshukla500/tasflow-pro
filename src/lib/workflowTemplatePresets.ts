/** Starter blueprints for common Youthnic / ops workflows. */

export type PresetStage = {
  name: string;
  description: string;
  default_tat_hours: number;
  escalate_on_breach: boolean;
  is_decision: boolean;
  is_terminal: boolean;
  outcome_label: string | null;
  yes_next_hint?: "next" | "end_success" | "end_fail";
  no_next_hint?: "next" | "end_success" | "end_fail";
};

export type PresetField = {
  label: string;
  field_type: "text" | "number" | "date";
  required: boolean;
};

export type WorkflowTemplatePreset = {
  id: string;
  name: string;
  category: string;
  description: string;
  blurb: string;
  stages: PresetStage[];
  fields: PresetField[];
};

export const WORKFLOW_TEMPLATE_PRESETS: WorkflowTemplatePreset[] = [
  {
    id: "purchase-approval",
    name: "Purchase Approval",
    category: "Procurement",
    description: "Indent → HOD review → Finance → PO / reject.",
    blurb: "3 stages + decision · Finance gate",
    stages: [
      {
        name: "Raise indent",
        description: "Requester submits purchase need with amount and vendor preference.",
        default_tat_hours: 8,
        escalate_on_breach: true,
        is_decision: false,
        is_terminal: false,
        outcome_label: null,
      },
      {
        name: "HOD review",
        description: "Department head approves need and budget fit.",
        default_tat_hours: 24,
        escalate_on_breach: true,
        is_decision: true,
        is_terminal: false,
        outcome_label: null,
        yes_next_hint: "next",
        no_next_hint: "end_fail",
      },
      {
        name: "Finance clearance",
        description: "Finance validates budget and releases for PO.",
        default_tat_hours: 24,
        escalate_on_breach: true,
        is_decision: true,
        is_terminal: false,
        outcome_label: null,
        yes_next_hint: "end_success",
        no_next_hint: "end_fail",
      },
      {
        name: "Approved — raise PO",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Successful",
      },
      {
        name: "Rejected",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Unsuccessful",
      },
    ],
    fields: [
      { label: "Indent ID", field_type: "text", required: true },
      { label: "Estimated amount", field_type: "number", required: true },
      { label: "Needed by", field_type: "date", required: false },
    ],
  },
  {
    id: "recruitment",
    name: "Recruitment Process",
    category: "HR",
    description: "Screening → interview → offer / decline.",
    blurb: "Hiring pipeline with yes/no gates",
    stages: [
      {
        name: "HR screening",
        description: "Shortlist resume and schedule interview.",
        default_tat_hours: 48,
        escalate_on_breach: true,
        is_decision: true,
        is_terminal: false,
        outcome_label: null,
        yes_next_hint: "next",
        no_next_hint: "end_fail",
      },
      {
        name: "Department interview",
        description: "Hiring manager evaluates skills and fit.",
        default_tat_hours: 72,
        escalate_on_breach: true,
        is_decision: true,
        is_terminal: false,
        outcome_label: null,
        yes_next_hint: "next",
        no_next_hint: "end_fail",
      },
      {
        name: "Offer & onboarding",
        description: "Issue offer letter and start joining formalities.",
        default_tat_hours: 48,
        escalate_on_breach: true,
        is_decision: false,
        is_terminal: false,
        outcome_label: null,
      },
      {
        name: "Hired",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Successful",
      },
      {
        name: "Not selected",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Unsuccessful",
      },
    ],
    fields: [
      { label: "Candidate name", field_type: "text", required: true },
      { label: "Role", field_type: "text", required: true },
      { label: "Interview date", field_type: "date", required: false },
    ],
  },
  {
    id: "qc-handoff",
    name: "QC → Production Handoff",
    category: "Operations",
    description: "QC check → rework or release to production.",
    blurb: "Quality gate before production",
    stages: [
      {
        name: "QC inspection",
        description: "Inspect lot against quality checklist.",
        default_tat_hours: 12,
        escalate_on_breach: true,
        is_decision: true,
        is_terminal: false,
        outcome_label: null,
        yes_next_hint: "next",
        no_next_hint: "end_fail",
      },
      {
        name: "Production intake",
        description: "Production accepts released lot and schedules line.",
        default_tat_hours: 24,
        escalate_on_breach: true,
        is_decision: false,
        is_terminal: false,
        outcome_label: null,
      },
      {
        name: "Released",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Successful",
      },
      {
        name: "Hold / rework",
        description: "",
        default_tat_hours: 1,
        escalate_on_breach: false,
        is_decision: false,
        is_terminal: true,
        outcome_label: "Unsuccessful",
      },
    ],
    fields: [
      { label: "Lot / batch no.", field_type: "text", required: true },
      { label: "Quantity", field_type: "number", required: false },
    ],
  },
];

export function blankTemplateStage(position = 1) {
  return {
    id: crypto.randomUUID(),
    position,
    name: "",
    description: "",
    owner_department_id: null as string | null,
    default_assignee_user_id: null as string | null,
    default_tat_hours: 24,
    escalate_on_breach: true,
    is_decision: false,
    yes_next_position: null as number | null,
    no_next_position: null as number | null,
    is_terminal: false,
    outcome_label: null as string | null,
  };
}

export function stagesFromPreset(preset: WorkflowTemplatePreset) {
  const stages = preset.stages.map((s, i) => ({
    ...blankTemplateStage(i + 1),
    name: s.name,
    description: s.description,
    default_tat_hours: s.default_tat_hours,
    escalate_on_breach: s.escalate_on_breach,
    is_decision: s.is_decision,
    is_terminal: s.is_terminal,
    outcome_label: s.outcome_label,
  }));

  // Resolve yes/no hints to positions after stages exist
  preset.stages.forEach((ps, i) => {
    if (!ps.is_decision) return;
    const successIdx = stages.findIndex((s) => s.is_terminal && s.outcome_label === "Successful");
    const failIdx = stages.findIndex((s) => s.is_terminal && s.outcome_label === "Unsuccessful");
    const mapHint = (hint?: string) => {
      if (!hint || hint === "next") return null;
      if (hint === "end_success" && successIdx >= 0) return successIdx + 1;
      if (hint === "end_fail" && failIdx >= 0) return failIdx + 1;
      return null;
    };
    stages[i].yes_next_position = mapHint(ps.yes_next_hint);
    stages[i].no_next_position = mapHint(ps.no_next_hint);
  });

  return stages;
}

export function fieldsFromPreset(preset: WorkflowTemplatePreset) {
  return preset.fields.map((f, i) => ({
    position: i + 1,
    label: f.label,
    field_key: f.label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    field_type: f.field_type,
    required: f.required,
  }));
}
