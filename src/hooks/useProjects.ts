import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listProjects, type ProjectWrite, createProject, updateProject, archiveProject, getProject } from "@/lib/projectsApi";
import type { ProjectRow } from "@/lib/projects";

export const projectsKeys = {
  all: ["projects"] as const,
  list: (includeArchived: boolean) => [...projectsKeys.all, "list", includeArchived] as const,
  detail: (id: string) => [...projectsKeys.all, "detail", id] as const,
};

export function useProjects(includeArchived = false) {
  const query = useQuery({
    queryKey: projectsKeys.list(includeArchived),
    queryFn: () => listProjects({ includeArchived }),
    staleTime: 60_000,
  });
  return {
    projects: (query.data || []) as ProjectRow[],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProject(id: string | undefined) {
  const query = useQuery({
    queryKey: projectsKeys.detail(id || ""),
    queryFn: () => getProject(id as string),
    enabled: !!id,
    staleTime: 60_000,
  });
  return {
    project: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProjectMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: projectsKeys.all });
  return {
    create: async (input: ProjectWrite) => {
      const row = await createProject(input);
      await invalidate();
      return row;
    },
    update: async (id: string, patch: Partial<ProjectWrite>) => {
      const row = await updateProject(id, patch);
      await invalidate();
      return row;
    },
    archive: async (id: string) => {
      await archiveProject(id);
      await invalidate();
    },
  };
}
