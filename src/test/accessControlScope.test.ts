import { describe, expect, it } from "vitest";
import { resolveAccessScope, scopeDescription } from "@/lib/accessControl";
import type { AuthUser } from "@/contexts/AuthContext";

function mockUser(overrides: Partial<AuthUser> & Pick<AuthUser, "roles">): AuthUser {
  return {
    id: "u1",
    email: "a@b.com",
    profile: null,
    organization: null,
    managedDepartments: [],
    departmentName: null,
    ...overrides,
  };
}

describe("scopeDescription", () => {
  it("uses a short label for full access (banner is hidden for admins)", () => {
    const scope = resolveAccessScope(mockUser({ roles: ["system_admin"] }));
    expect(scope.hasFullAccess).toBe(true);
    expect(scopeDescription(scope, [])).toBe("Organization-wide");
    expect(scopeDescription(scope, [])).not.toMatch(/full access/i);
  });

  it("names managed departments for managers", () => {
    const scope = resolveAccessScope(
      mockUser({ roles: ["department_manager"], managedDepartments: ["d1"] }),
    );
    expect(scope.isManager).toBe(true);
    expect(scopeDescription(scope, ["Production"])).toBe("Production");
  });
});
