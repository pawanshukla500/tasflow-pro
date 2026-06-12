import { type McpTool, objectSchema } from "./types.ts";

export const workflowTools: McpTool[] = [
  {
    name: "list_workflows",
    description:
      "List workflows visible to the current user (those they raised, are assigned a stage in, or can see by role).",
    inputSchema: objectSchema({
      status: { type: "string", description: "Filter by workflow status (e.g. active, completed)." },
      limit: { type: "number", description: "Max rows (default 50, max 200)." },
    }),
    handler: async ({ client }, args) => {
      let q = client
        .from("workflows")
        .select("id, title, description, status, priority, current_stage_position, raised_by, raised_by_department_id, created_at, completed_at")
        .order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", String(args.status));
      q = q.limit(Math.min(Number(args.limit) || 50, 200));
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data || [];
    },
  },
  {
    name: "get_workflow",
    description: "Get a workflow with its ordered stages.",
    inputSchema: objectSchema({ workflow_id: { type: "string" } }, ["workflow_id"]),
    handler: async ({ client }, args) => {
      const { data: wf, error } = await client
        .from("workflows").select("*").eq("id", String(args.workflow_id)).maybeSingle();
      if (error) throw new Error(error.message);
      if (!wf) throw new Error("Workflow not found or not accessible");
      const { data: stages, error: sErr } = await client
        .from("workflow_stages")
        .select("id, name, position, status, assignee_user_id, is_decision, is_terminal, decision, tat_hours, started_at, completed_at, notes")
        .eq("workflow_id", String(args.workflow_id))
        .order("position");
      if (sErr) throw new Error(sErr.message);
      return { ...wf, stages: stages || [] };
    },
  },
  {
    name: "advance_workflow_stage",
    description:
      "Complete the current stage of a workflow and move it forward. For decision stages, provide a decision ('yes' or 'no'). Optionally attach a note.",
    inputSchema: objectSchema(
      {
        workflow_id: { type: "string" },
        decision: { type: "string", enum: ["yes", "no"], description: "Required for decision stages." },
        note: { type: "string" },
      },
      ["workflow_id"],
    ),
    handler: async ({ client, userId }, args) => {
      const { data: wf, error: wfErr } = await client
        .from("workflows").select("id, current_stage_position, status").eq("id", String(args.workflow_id)).maybeSingle();
      if (wfErr) throw new Error(wfErr.message);
      if (!wf) throw new Error("Workflow not found or not accessible");

      const { data: stage, error: stErr } = await client
        .from("workflow_stages").select("*")
        .eq("workflow_id", wf.id).eq("position", wf.current_stage_position).maybeSingle();
      if (stErr) throw new Error(stErr.message);
      if (!stage) throw new Error("Current stage not found");

      const now = new Date().toISOString();
      const decision = args.decision ? String(args.decision) : null;
      if (stage.is_decision && !decision) throw new Error("This stage requires a decision ('yes' or 'no')");

      const { error: updStageErr } = await client
        .from("workflow_stages")
        .update({
          status: "completed",
          completed_at: now,
          completed_by: userId,
          decision,
          notes: args.note ? String(args.note) : stage.notes,
        })
        .eq("id", stage.id);
      if (updStageErr) throw new Error(updStageErr.message);

      // Record the transition (RLS permitting).
      await client.from("workflow_stage_events").insert({
        workflow_id: wf.id,
        stage_id: stage.id,
        actor_id: userId,
        event_type: "completed",
        to_value: decision,
        note: args.note ? String(args.note) : null,
      }).then(() => {}, () => {});

      // Determine next position: decision branches use yes/no_next_position.
      let nextPosition: number | null;
      if (stage.is_terminal) {
        nextPosition = null;
      } else if (stage.is_decision) {
        nextPosition = decision === "yes" ? stage.yes_next_position : stage.no_next_position;
        if (nextPosition == null) nextPosition = stage.position + 1;
      } else {
        nextPosition = stage.position + 1;
      }

      let workflowStatus = wf.status;
      if (nextPosition == null) {
        workflowStatus = "completed";
        await client.from("workflows")
          .update({ status: "completed", completed_at: now }).eq("id", wf.id);
      } else {
        const { data: next } = await client
          .from("workflow_stages").select("id").eq("workflow_id", wf.id).eq("position", nextPosition).maybeSingle();
        await client.from("workflows").update({ current_stage_position: nextPosition }).eq("id", wf.id);
        if (next) {
          await client.from("workflow_stages")
            .update({ status: "in_progress", started_at: now }).eq("id", next.id);
        }
      }

      return {
        workflow_id: wf.id,
        completed_stage: stage.name,
        decision,
        next_stage_position: nextPosition,
        workflow_status: workflowStatus,
      };
    },
  },
];
