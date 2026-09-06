import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProjectSection,
  deleteProjectSection,
  listProjectSections,
  updateProjectSection,
} from "@/lib/projectSectionsApi";
import type { ProjectSectionRow } from "@/lib/projectLookup";

export const projectSectionKeys = {
  all: ["project-sections"] as const,
  list: (projectId: string) => [...projectSectionKeys.all, projectId] as const,
};

export function useProjectSections(projectId: string | undefined) {
  const query = useQuery({
    queryKey: projectSectionKeys.list(projectId || ""),
    queryFn: () => listProjectSections(projectId as string),
    enabled: !!projectId,
    staleTime: 30_000,
  });
  return {
    sections: (query.data || []) as ProjectSectionRow[],
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProjectSectionMutations(projectId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (projectId) {
      return queryClient.invalidateQueries({ queryKey: projectSectionKeys.list(projectId) });
    }
    return queryClient.invalidateQueries({ queryKey: projectSectionKeys.all });
  };
  return {
    create: async (title: string) => {
      if (!projectId) throw new Error("Project required");
      const existing = queryClient.getQueryData<ProjectSectionRow[]>(projectSectionKeys.list(projectId)) || [];
      const sort_order = existing.length === 0 ? 0 : Math.max(...existing.map((s) => s.sort_order)) + 1;
      const row = await createProjectSection({ project_id: projectId, title, sort_order });
      await invalidate();
      return row;
    },
    update: async (id: string, patch: { title?: string; description?: string | null; sort_order?: number }) => {
      const row = await updateProjectSection(id, patch);
      await invalidate();
      return row;
    },
    remove: async (id: string) => {
      await deleteProjectSection(id);
      await invalidate();
    },
  };
}
