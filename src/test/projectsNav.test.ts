import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("projects replace inbox", () => {
  it("puts Projects in the workspace nav and drops Inbox", () => {
    const sidebar = readFileSync(resolve(root, "src/components/AppSidebar.tsx"), "utf8");
    expect(sidebar).toContain('label: "Projects"');
    expect(sidebar).toContain('path: "/projects"');
    expect(sidebar).not.toMatch(/label:\s*"Inbox"/);
    expect(sidebar).not.toContain('path: "/inbox"');
  });

  it("routes /projects and redirects /inbox", () => {
    const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
    expect(app).toContain('path="/projects"');
    expect(app).toContain('path="/projects/:id"');
    expect(app).toMatch(/path="\/inbox"[^>]*Navigate to="\/projects"/);
    expect(app).not.toContain("InboxPage");
  });

  it("exposes project MCP tools", () => {
    const index = readFileSync(resolve(root, "supabase/functions/mcp-server/tools/index.ts"), "utf8");
    expect(index).toContain("projectTools");
    const tools = readFileSync(resolve(root, "supabase/functions/mcp-server/tools/projects.ts"), "utf8");
    expect(tools).toContain('name: "list_projects"');
    expect(tools).toContain('name: "create_project"');
  });

  it("shows project status as pipeline steps on the detail board", () => {
    const page = readFileSync(resolve(root, "src/pages/ProjectDetailPage.tsx"), "utf8");
    expect(page).toContain("ProjectPipelineBar");
    expect(page).toContain("ProjectBoardView");
    expect(page).not.toMatch(/%\} complete/);
    const board = readFileSync(resolve(root, "src/components/ProjectBoardView.tsx"), "utf8");
    expect(board).toContain("PROJECT_BOARD_COLUMNS");
    expect(board).toContain("flex-1 min-w-[13rem]");
    expect(board).toContain("onDrop");
  });
});
