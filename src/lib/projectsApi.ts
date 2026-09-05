import { supabase } from "@/integrations/supabase/client";
import type { ProjectRow, ProjectStatus, ProjectView } from "@/lib/projects";
import { isProjectView } from "@/lib/projects";

function mapProject(row: Record<string, unknown>): ProjectRow {
  const status = row.status === "archived" ? "archived" : "active";
  const view = isProjectView(String(row.default_view || "")) ? (row.default_view as ProjectView) : "board";
  return {
    id: String(row.id),
    organization_id: (row.organization_id as string | null) ?? null,
    department_id: (row.department_id as string | null) ?? null,
    name: String(row.name || ""),
    description: (row.description as string | null) ?? null,
    icon: String(row.icon || "📁"),
    color: String(row.color || "#0D9488"),
    status: status as ProjectStatus,
    default_view: view,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function listProjects(options: { includeArchived?: boolean } = {}): Promise<ProjectRow[]> {
  let q = supabase.from("projects").select("*").order("created_at", { ascending: false });
  if (!options.includeArchived) q = q.eq("status", "active");
  const { data, error } = await q;
  if (error) {
    if (/does not exist|42703|PGRST205|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data || []).map((row) => mapProject(row as Record<string, unknown>));
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (/does not exist|42703|PGRST205|schema cache/i.test(error.message)) return null;
    throw error;
  }
  return data ? mapProject(data as Record<string, unknown>) : null;
}

export type ProjectWrite = {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  department_id?: string | null;
  status?: ProjectStatus;
  default_view?: ProjectView;
  organization_id?: string | null;
  created_by?: string | null;
};

export async function createProject(input: ProjectWrite): Promise<ProjectRow> {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon || "📁",
      color: input.color || "#0D9488",
      department_id: input.department_id || null,
      status: input.status || "active",
      default_view: input.default_view || "board",
      organization_id: input.organization_id || null,
      created_by: input.created_by || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapProject(data as Record<string, unknown>);
}

export async function updateProject(id: string, patch: Partial<ProjectWrite>): Promise<ProjectRow> {
  const payload: Record<string, unknown> = {};
  if (patch.name != null) payload.name = patch.name.trim();
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
  if (patch.icon != null) payload.icon = patch.icon;
  if (patch.color != null) payload.color = patch.color;
  if (patch.department_id !== undefined) payload.department_id = patch.department_id || null;
  if (patch.status != null) payload.status = patch.status;
  if (patch.default_view != null) payload.default_view = patch.default_view;
  const { data, error } = await supabase.from("projects").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return mapProject(data as Record<string, unknown>);
}

export async function archiveProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id);
  if (error) throw error;
}
