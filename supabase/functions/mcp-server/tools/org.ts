import { type McpTool, objectSchema } from "./types.ts";

export const orgTools: McpTool[] = [
  {
    name: "whoami",
    description: "Return the current user's profile, roles, and access scope for this connection.",
    inputSchema: objectSchema({}),
    handler: async ({ client, userId, email }) => {
      const [profileRes, rolesRes, deptMgrRes] = await Promise.all([
        client.from("profiles").select("id, name, email, position, department_id, organization_id").eq("id", userId).maybeSingle(),
        client.from("user_roles").select("role").eq("user_id", userId),
        client.from("department_managers").select("department_id").eq("user_id", userId),
      ]);
      return {
        user_id: userId,
        email,
        profile: profileRes.data ?? null,
        roles: (rolesRes.data || []).map((r) => r.role),
        managed_departments: (deptMgrRes.data || []).map((d) => d.department_id),
      };
    },
  },
  {
    name: "list_departments",
    description: "List departments the current user can see.",
    inputSchema: objectSchema({}),
    handler: async ({ client }) => {
      const { data, error } = await client
        .from("departments").select("id, name, color, description").order("name");
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "list_team_members",
    description:
      "List people (profiles) the current user can see, optionally filtered by department. Scoped by role via RLS.",
    inputSchema: objectSchema({
      department_id: { type: "string", description: "Filter by department UUID." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("profiles")
        .select("id, name, email, position, department_id, active")
        .order("name");
      if (args.department_id) q = q.eq("department_id", String(args.department_id));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
];
