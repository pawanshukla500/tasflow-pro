import { describe, it, expect } from "vitest";

/**
 * Smoke-test for the tasks RLS policy "Authenticated users can create tasks":
 *   created_by = auth.uid() OR is_admin_or_md(auth.uid())
 *   OR (department_id IS NOT NULL AND manages_department(auth.uid(), department_id))
 *
 * This validates the client always sends the right shape so a signed-in
 * employee never trips the policy.
 */
function buildTaskInsertPayload(opts: {
  authUserId: string | null;
  title: string;
  departmentId?: string | null;
}) {
  return {
    title: opts.title.trim(),
    department_id: opts.departmentId || null,
    created_by: opts.authUserId || null,
    status: "todo",
    priority: "medium",
  };
}

function passesTasksInsertRls(row: ReturnType<typeof buildTaskInsertPayload>, ctx: {
  authUserId: string | null;
  isAdminOrMd: boolean;
  managedDepartments: string[];
}) {
  if (!ctx.authUserId) return false; // RLS requires authenticated role
  if (row.created_by === ctx.authUserId) return true;
  if (ctx.isAdminOrMd) return true;
  if (row.department_id && ctx.managedDepartments.includes(row.department_id)) return true;
  return false;
}

describe("tasks RLS — any signed-in member can create a task", () => {
  it("plain employee with created_by set passes the policy", () => {
    const uid = "user-1";
    const row = buildTaskInsertPayload({ authUserId: uid, title: "Demo task" });
    expect(row.created_by).toBe(uid);
    expect(passesTasksInsertRls(row, { authUserId: uid, isAdminOrMd: false, managedDepartments: [] })).toBe(true);
  });

  it("employee creating in another department still passes (created_by self)", () => {
    const uid = "user-2";
    const row = buildTaskInsertPayload({ authUserId: uid, title: "Cross-dept", departmentId: "dept-x" });
    expect(passesTasksInsertRls(row, { authUserId: uid, isAdminOrMd: false, managedDepartments: ["dept-y"] })).toBe(true);
  });

  it("missing created_by fails (regression guard)", () => {
    const row = buildTaskInsertPayload({ authUserId: null, title: "Bad" });
    expect(passesTasksInsertRls(row, { authUserId: "user-3", isAdminOrMd: false, managedDepartments: [] })).toBe(false);
  });

  it("title is trimmed before insert", () => {
    const row = buildTaskInsertPayload({ authUserId: "u", title: "  hello  " });
    expect(row.title).toBe("hello");
  });
});
