import { supabase } from "@/integrations/supabase/client";
import { sortSections, type ProjectSectionRow } from "@/lib/projectLookup";

function mapSection(row: Record<string, unknown>): ProjectSectionRow {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    organization_id: (row.organization_id as string | null) ?? null,
    title: String(row.title || ""),
    description: (row.description as string | null) ?? null,
    sort_order: Number(row.sort_order || 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
  };
}

export async function listProjectSections(projectId: string): Promise<ProjectSectionRow[]> {
  const { data, error } = await supabase
    .from("project_sections")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    if (/does not exist|42703|PGRST205|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return sortSections((data || []).map((row) => mapSection(row as Record<string, unknown>)));
}

export async function createProjectSection(input: {
  project_id: string;
  title: string;
  description?: string | null;
  sort_order?: number;
  created_by?: string | null;
}): Promise<ProjectSectionRow> {
  const { data, error } = await supabase
    .from("project_sections")
    .insert({
      project_id: input.project_id,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      sort_order: input.sort_order ?? 0,
      created_by: input.created_by || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapSection(data as Record<string, unknown>);
}

export async function updateProjectSection(
  id: string,
  patch: { title?: string; description?: string | null; sort_order?: number },
): Promise<ProjectSectionRow> {
  const payload: Record<string, unknown> = {};
  if (patch.title != null) payload.title = patch.title.trim();
  if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
  if (patch.sort_order != null) payload.sort_order = patch.sort_order;
  const { data, error } = await supabase.from("project_sections").update(payload).eq("id", id).select("*").single();
  if (error) throw error;
  return mapSection(data as Record<string, unknown>);
}

export async function deleteProjectSection(id: string): Promise<void> {
  const { error } = await supabase.from("project_sections").delete().eq("id", id);
  if (error) throw error;
}

export async function searchLookupEntities(query: string, limit = 8): Promise<{
  kind: "task" | "project";
  id: string;
  title: string;
  status?: string;
}[]> {
  const q = query.replace(/^(task|project):/i, "").trim();
  const like = q ? `%${q}%` : "%";
  const [tasks, projects] = await Promise.all([
    supabase.from("tasks").select("id, title, status").ilike("title", like).limit(limit),
    supabase.from("projects").select("id, name, status").eq("status", "active").ilike("name", like).limit(limit),
  ]);
  const out: { kind: "task" | "project"; id: string; title: string; status?: string }[] = [];
  for (const row of projects.data || []) {
    out.push({ kind: "project", id: row.id, title: row.name, status: row.status });
  }
  for (const row of tasks.data || []) {
    out.push({ kind: "task", id: row.id, title: row.title, status: row.status });
  }
  return out;
}
