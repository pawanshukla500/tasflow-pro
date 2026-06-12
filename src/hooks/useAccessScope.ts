import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  resolveAccessScope,
  filterByDepartments,
  filterBoardTasksForUser,
  filterProfilesInScope,
  filterTasksInScope,
  scopeDescription,
  type AccessScope,
} from "@/lib/accessControl";

export function useAccessScope() {
  const { user } = useAuth();

  const scope = useMemo(() => resolveAccessScope(user), [user]);

  return {
    scope,
    user,
    scopeLabel: scopeDescription(scope, user?.managedDepartments?.length
      ? [] // filled by pages with dept names
      : user?.departmentName ? [user.departmentName] : []),
    filterDepartments: <T extends { id: string }>(depts: T[]) => {
      if (scope.departmentIds === null) return depts;
      return depts.filter((d) => scope.departmentIds!.includes(d.id));
    },
    filterProfiles: <T extends { id: string; department_id?: string | null }>(profiles: T[]) =>
      filterProfilesInScope(profiles, scope, user?.id),
    filterTasks: <
      T extends {
        department_id?: string | null;
        created_by?: string | null;
        assignees?: { user_id: string }[];
      },
    >(
      tasks: T[],
      profiles: { id: string; department_id?: string | null }[],
    ) => {
      const teamIds = new Set(
        filterProfilesInScope(profiles, scope, user?.id).map((p) => p.id),
      );
      return filterTasksInScope(tasks, scope, teamIds);
    },
    filterByDeptField: <T extends { department_id?: string | null }>(rows: T[]) =>
      filterByDepartments(rows, scope),
    filterBoardTasks: <
      T extends {
        department_id?: string | null;
        created_by?: string | null;
        assignees?: { user_id: string }[];
      },
    >(
      tasks: T[],
      profiles: { id: string; department_id?: string | null }[],
      filterUserId?: string | null,
      filterDepartmentId?: string | null,
    ) => {
      const teamIds = new Set(
        filterProfilesInScope(profiles, scope, user?.id).map((p) => p.id),
      );
      return filterBoardTasksForUser(
        tasks,
        scope,
        user?.id,
        teamIds,
        filterUserId,
        filterDepartmentId,
      );
    },
  };
}

export type { AccessScope };
