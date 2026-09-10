# Connect Cursor, Claude Code, and Antigravity

TaskFlow Pro is an MCP server. You authenticate as **yourself** with a Personal
Access Token from **Settings → Integrations → AI connections**. Every tool call
runs under your TaskFlow role (same as the website).

MCP server URL:

`https://nekdjoquirhecmejuoba.supabase.co/functions/v1/mcp-server`

Never commit the token. Use **user-level** config files.

## Authenticate

1. Sign in to [task.youthnic.shop](https://task.youthnic.shop) with your Firebase account.
2. Settings → Integrations → Generate Token (name it Cursor / Claude Code / Antigravity).
3. Copy the token once. Paste it into the matching client below.

## Cursor

Edit `~/.cursor/mcp.json` (Cursor Settings → MCP). Do not put the token in the
repo’s `.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "taskflow-pro": {
      "url": "https://nekdjoquirhecmejuoba.supabase.co/functions/v1/mcp-server",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

Restart Cursor. Ask it to start work on this repo so it creates your TaskFlow project and a task assigned to you.

## Claude Code

User-scoped (every project):

```bash
claude mcp add --transport http taskflow-pro \
  https://nekdjoquirhecmejuoba.supabase.co/functions/v1/mcp-server \
  --header "Authorization: Bearer YOUR_TOKEN"
```

Then `claude mcp list`.

## Google Antigravity

Agent panel → … → MCP Servers → Manage → View raw config  
(`~/.gemini/config/mcp_config.json`). Antigravity wants **`serverUrl`**, not `url`.

```json
{
  "mcpServers": {
    "taskflow-pro": {
      "serverUrl": "https://nekdjoquirhecmejuoba.supabase.co/functions/v1/mcp-server",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

Save and refresh MCP servers.

## What the agent must do in TaskFlow

On every coding session call `sync_coding_work` with:

- `project_name` — repo or product name
- `task_title` — what you are doing
- optional `task_description`, `status` (`in_progress` by default, `done` when finished)

That finds or creates the project, creates a real task, and **assigns it to you**.
Further calls update the same open task. `create_task` also assigns you unless
`assignee_ids` is set.

Other tools: `whoami`, `list_my_tasks`, `update_task`, `complete_task`,
`list_projects`, `list_workflows`, `advance_workflow_stage`.

## What stays in the coding tool

Documentation edits, git commits, pull requests, PR merges, and GitHub Actions
are **not** TaskFlow MCP tools. The same agent should use `git` / `gh` for those
while it keeps TaskFlow tasks in sync.
