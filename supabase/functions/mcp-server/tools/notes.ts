import { type McpTool, objectSchema } from "./types.ts";

// Quick Notes — personal scratch notes (table user_scratch_notes, own-row RLS).

export const noteTools: McpTool[] = [
  {
    name: "list_notes",
    description: "List the current user's quick notes (most recently updated first).",
    inputSchema: objectSchema({}),
    handler: async ({ client }) => {
      const { data, error } = await client
        .from("user_scratch_notes")
        .select("id, content, polished_content, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "create_note",
    description: "Create a new quick note for the current user.",
    inputSchema: objectSchema({ content: { type: "string" } }, ["content"]),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("user_scratch_notes")
        .insert({ user_id: userId, content: String(args.content) })
        .select("id, content, created_at")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  },
  {
    name: "update_note",
    description: "Update the content of an existing quick note.",
    inputSchema: objectSchema(
      { note_id: { type: "string" }, content: { type: "string" } },
      ["note_id", "content"],
    ),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("user_scratch_notes")
        .update({ content: String(args.content), updated_at: new Date().toISOString() })
        .eq("id", String(args.note_id))
        .select("id, content, updated_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Note not found or not yours");
      return data;
    },
  },
  {
    name: "delete_note",
    description: "Delete a quick note.",
    inputSchema: objectSchema({ note_id: { type: "string" } }, ["note_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("user_scratch_notes").delete().eq("id", String(args.note_id));
      if (error) throw new Error(error.message);
      return { deleted: true, note_id: args.note_id };
    },
  },
];
