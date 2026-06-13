import { type McpTool, objectSchema, permissionError } from "./types.ts";

// Inbox — in-app notifications + internal chat (RLS: own notifications; chat by participant).

export const inboxTools: McpTool[] = [
  {
    name: "list_notifications",
    description: "List the current user's in-app notifications, newest first.",
    inputSchema: objectSchema({
      unread_only: { type: "boolean", description: "Only return unread notifications (default false)." },
      limit: { type: "number", description: "Max rows (default 30, max 100)." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("in_app_notifications")
        .select("id, notification_type, title, body, action_url, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 30, 100));
      if (args.unread_only) q = q.is("read_at", null);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "mark_notification_read",
    description: "Mark a single notification as read.",
    inputSchema: objectSchema({ notification_id: { type: "string" } }, ["notification_id"]),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("in_app_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", String(args.notification_id))
        .select("id, read_at")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Notification not found");
      return data;
    },
  },
  {
    name: "mark_all_notifications_read",
    description: "Mark all of the current user's unread notifications as read.",
    inputSchema: objectSchema({}),
    handler: async ({ client }) => {
      const { data, error } = await client
        .from("in_app_notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      return { marked_read: (data || []).length };
    },
  },
  {
    name: "list_conversations",
    description: "List the current user's chat conversations (most recent activity first).",
    inputSchema: objectSchema({}),
    handler: async ({ client }) => {
      const { data, error } = await client
        .from("conversations")
        .select("id, title, is_group, last_message_at, created_at")
        .order("last_message_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "list_messages",
    description: "List messages in a conversation, newest first.",
    inputSchema: objectSchema(
      {
        conversation_id: { type: "string" },
        limit: { type: "number", description: "Max messages (default 30, max 100)." },
      },
      ["conversation_id"],
    ),
    handler: async ({ client }, args) => {
      const { data, error } = await client
        .from("chat_messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", String(args.conversation_id))
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit) || 30, 100));
      if (error) throw new Error(error.message);
      const rows = data || [];
      const senderIds = [...new Set(rows.map((m) => m.sender_id))];
      const { data: profiles } = senderIds.length
        ? await client.from("profiles").select("id, name").in("id", senderIds)
        : { data: [] };
      return rows.map((m) => ({
        ...m,
        sender_name: (profiles || []).find((p) => p.id === m.sender_id)?.name || "Unknown",
      }));
    },
  },
  {
    name: "send_message",
    description: "Send a chat message in a conversation the current user is part of.",
    inputSchema: objectSchema(
      { conversation_id: { type: "string" }, body: { type: "string" } },
      ["conversation_id", "body"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("chat_messages")
        .insert({
          conversation_id: String(args.conversation_id),
          sender_id: userId,
          body: String(args.body),
        })
        .select("id, conversation_id, body, created_at")
        .single();
      if (error) throw permissionError(error, "send a message in this conversation");
      return data;
    },
  },
  {
    name: "start_conversation",
    description:
      "Start a new chat conversation with one or more people, optionally with a first message. " +
      "Use list_team_members to find user IDs.",
    inputSchema: objectSchema(
      {
        participant_ids: { type: "array", items: { type: "string" }, description: "User UUIDs to include (besides you)." },
        title: { type: "string", description: "Optional title (for group chats)." },
        is_group: { type: "boolean", description: "Group chat? Defaults to true if >1 participant." },
        first_message: { type: "string", description: "Optional message to send immediately." },
      },
      ["participant_ids"],
    ),
    handler: async ({ client, userId }, args) => {
      const participants = Array.isArray(args.participant_ids) ? (args.participant_ids as string[]) : [];
      if (participants.length === 0) throw new Error("At least one participant is required");
      const isGroup = args.is_group !== undefined ? Boolean(args.is_group) : participants.length > 1;
      const { data: convId, error } = await client.rpc("create_conversation_with_participants", {
        _is_group: isGroup,
        _participant_ids: participants,
        _title: args.title ? String(args.title) : null,
      });
      if (error) throw permissionError(error, "start a conversation");

      let firstMessage = null;
      if (args.first_message) {
        const { data: msg } = await client
          .from("chat_messages")
          .insert({ conversation_id: convId, sender_id: userId, body: String(args.first_message) })
          .select("id, body, created_at").maybeSingle();
        firstMessage = msg;
      }
      return { conversation_id: convId, first_message: firstMessage };
    },
  },
  {
    name: "mark_conversation_read",
    description: "Mark a conversation as read up to now (updates your last-read timestamp).",
    inputSchema: objectSchema({ conversation_id: { type: "string" } }, ["conversation_id"]),
    handler: async ({ client, userId }, args) => {
      const { data, error } = await client
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", String(args.conversation_id))
        .eq("user_id", userId)
        .select("conversation_id, last_read_at")
        .maybeSingle();
      if (error) throw permissionError(error, "mark this conversation read");
      if (!data) throw new Error("Conversation not found or you're not a participant");
      return data;
    },
  },
  {
    name: "delete_conversation",
    description: "Delete a conversation and its messages.",
    inputSchema: objectSchema({ conversation_id: { type: "string" } }, ["conversation_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.rpc("delete_conversation_cascade", { _conv_id: String(args.conversation_id) });
      if (error) throw permissionError(error, "delete this conversation");
      return { deleted: true, conversation_id: args.conversation_id };
    },
  },
  {
    name: "delete_message",
    description: "Delete one of your own chat messages.",
    inputSchema: objectSchema({ message_id: { type: "string" } }, ["message_id"]),
    handler: async ({ client }, args) => {
      const { error } = await client.from("chat_messages").delete().eq("id", String(args.message_id));
      if (error) throw permissionError(error, "delete this message");
      return { deleted: true, message_id: args.message_id };
    },
  },
];
