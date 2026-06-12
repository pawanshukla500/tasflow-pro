import type { AppRole, AuthUser } from "@/contexts/AuthContext";

/** Organization leadership — full platform access within the org. */
export const FULL_ACCESS_ROLES: AppRole[] = ["system_admin", "managing_director"];

/** Department / team leadership (HOD, Team Leader). */
export const MANAGER_ROLES: AppRole[] = ["department_manager"];

export type AccessTier = "full" | "manager" | "hr" | "member";

export interface AccessScope {
  tier: AccessTier;
  hasFullAccess: boolean;
  isManager: boolean;
  isHR: boolean;
  /** `null` = entire organization; otherwise limited department IDs. */
  departmentIds: string[] | null;
  canManageTeam: boolean;
  canViewTeam: boolean;
  canViewDeptPerformance: boolean;
  canManageDepartments: boolean;
  canAccessAdminSettings: boolean;
  canCreateTasks: boolean;
  primaryRole: AppRole | null;
  primaryRoleLabel: string;
}

export function hasFullAccess(roles: AppRole[]): boolean {
  return roles.some((r) => FULL_ACCESS_ROLES.includes(r));
}

export function isDepartmentManager(roles: AppRole[]): boolean {
  return roles.includes("department_manager");
}

export function isHRMember(roles: AppRole[]): boolean {
  return roles.includes("hr");
}

export function isManagerOrAbove(roles: AppRole[]): boolean {
  return hasFullAccess(roles) || isDepartmentManager(roles) || isHRMember(roles);
}

export function resolveAccessScope(user: AuthUser | null): AccessScope {
  const roles = user?.roles ?? [];
  const full = hasFullAccess(roles);
  const mgr = isDepartmentManager(roles);
  const hr = isHRMember(roles);

  let tier: AccessTier = "member";
  if (full) tier = "full";
  else if (mgr) tier = "manager";
  else if (hr) tier = "hr";

  const managed = user?.managedDepartments ?? [];
  const ownDept = user?.profile?.department_id ?? null;

  let departmentIds: string[] | null = null;
  if (full || hr) {
    departmentIds = null;
  } else if (mgr) {
    const ids = managed.length > 0 ? managed : ownDept ? [ownDept] : [];
    departmentIds = ids.length > 0 ? ids : [];
  } else if (ownDept) {
    departmentIds = [ownDept];
  } else {
    departmentIds = [];
  }

  const primaryRole = roles[0] ?? null;

  return {
    tier,
    hasFullAccess: full,
    isManager: mgr,
    isHR: hr,
    departmentIds,
    canManageTeam: full || mgr || hr,
    canViewTeam: full || mgr || hr,
    canViewDeptPerformance: full || mgr || hr,
    canManageDepartments: full,
    canAccessAdminSettings: full,
    canCreateTasks: full || mgr || hr,
    primaryRole,
    primaryRoleLabel: primaryRole ? roleDisplayName(primaryRole) : "Team Member",
  };
}

export function roleDisplayName(role: AppRole | string): string {
  const map: Record<string, string> = {
    employee: "Team Member",
    department_manager: "Team Leader (HOD)",
    managing_director: "Managing Director",
    system_admin: "System Admin",
    hr: "HR",
  };
  return map[role] || String(role).replace(/_/g, " ");
}

export function inDepartmentScope(
  departmentId: string | null | undefined,
  scope: AccessScope,
): boolean {
  if (scope.hasFullAccess || scope.isHR) return true;
  if (!departmentId) return false;
  if (scope.departmentIds === null) return true;
  return scope.departmentIds.includes(departmentId);
}

export function filterByDepartments<T extends { department_id?: string | null }>(
  rows: T[],
  scope: AccessScope,
): T[] {
  if (scope.departmentIds === null) return rows;
  if (scope.departmentIds.length === 0) return [];
  return rows.filter((r) => r.department_id && scope.departmentIds!.includes(r.department_id));
}

export function filterProfilesInScope<
  T extends { id: string; department_id?: string | null },
>(
  profiles: T[],
  scope: AccessScope,
  includeSelfId?: string,
): T[] {
  if (scope.departmentIds === null) return profiles;
  if (scope.departmentIds.length === 0) {
    return includeSelfId ? profiles.filter((p) => p.id === includeSelfId) : [];
  }
  return profiles.filter(
    (p) =>
      (p.department_id && scope.departmentIds!.includes(p.department_id)) ||
      p.id === includeSelfId,
  );
}

/** Board view: employees see only their own tasks; leadership uses scope filters. */
export function filterBoardTasksForUser<
  T extends {
    department_id?: string | null;
    created_by?: string | null;
    assignees?: { user_id: string }[];
  },
>(
  tasks: T[],
  scope: AccessScope,
  userId: string | undefined,
  teamMemberIds: Set<string>,
  filterUserId?: string | null,
  filterDepartmentId?: string | null,
): T[] {
  let rows = tasks;

  if (scope.tier === "member" && userId) {
    rows = rows.filter(
      (t) =>
        t.created_by === userId ||
        t.assignees?.some((a) => a.user_id === userId),
    );
  } else {
    rows = filterTasksInScope(rows, scope, teamMemberIds);
  }

  if (filterDepartmentId && filterDepartmentId !== "all") {
    rows = rows.filter((t) => t.department_id === filterDepartmentId);
  }
  if (filterUserId && filterUserId !== "all") {
    rows = rows.filter(
      (t) =>
        t.created_by === filterUserId ||
        t.assignees?.some((a) => a.user_id === filterUserId),
    );
  }

  return rows;
}

export function filterTasksInScope<
  T extends {
    department_id?: string | null;
    created_by?: string | null;
    assignees?: { user_id: string }[];
  },
>(
  tasks: T[],
  scope: AccessScope,
  teamMemberIds: Set<string>,
): T[] {
  if (scope.hasFullAccess || scope.isHR) return tasks;
  if (scope.isManager && scope.departmentIds) {
    return tasks.filter((t) => {
      if (t.department_id && scope.departmentIds!.includes(t.department_id)) return true;
      if (t.created_by && teamMemberIds.has(t.created_by)) return true;
      if (t.assignees?.some((a) => teamMemberIds.has(a.user_id))) return true;
      return false;
    });
  }
  return tasks;
}

export function scopeDescription(scope: AccessScope, departmentNames: string[]): string {
  if (scope.hasFullAccess) return "Organization-wide view — full access";
  if (scope.isHR) return "People operations — all departments";
  if (scope.isManager) {
    if (departmentNames.length === 0) return "Your department — team & task performance";
    if (departmentNames.length === 1) return `${departmentNames[0]} — team & task performance`;
    return `${departmentNames.join(", ")} — team & task performance`;
  }
  return "Personal workspace";
}
