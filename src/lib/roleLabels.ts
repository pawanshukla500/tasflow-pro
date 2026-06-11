import type { AppRole } from "@/contexts/AuthContext";

/** User-facing role labels (maps to DB app_role enum). */
export const ROLE_OPTIONS: { value: AppRole; label: string; description: string; needsDepartment: boolean }[] = [
  {
    value: "employee",
    label: "Team Member",
    description: "Works within a department on assigned tasks",
    needsDepartment: true,
  },
  {
    value: "department_manager",
    label: "Team Leader (HOD)",
    description: "Manages department team members, tasks, and performance",
    needsDepartment: true,
  },
  {
    value: "managing_director",
    label: "Managing Director (MD)",
    description: "Organization-wide leadership and oversight",
    needsDepartment: false,
  },
  {
    value: "system_admin",
    label: "System Admin",
    description: "Full platform administration",
    needsDepartment: false,
  },
  {
    value: "hr",
    label: "HR",
    description: "People operations and team visibility",
    needsDepartment: false,
  },
];

export function roleLabel(role: AppRole | string): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || String(role).replace(/_/g, " ");
}
