import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetailPage from "@/pages/ProjectDetailPage";
import type { ProjectRow } from "@/lib/projects";
import type { TaskRow } from "@/lib/tasksApi";

const project: ProjectRow = {
  id: "7ec222a8-99b2-4e62-b428-b6d585c8a7ef",
  organization_id: "org1",
  department_id: null,
  name: "Website rebuild",
  description: "Launch the new site",
  icon: "🚀",
  color: "#0D9488",
  status: "active",
  default_view: "board",
  flow_mode: "parallel",
  start_date: null,
  due_date: null,
  budget_amount: 50000,
  budget_currency: "INR",
  allocated_hours: 80,
  created_by: "u1",
  created_at: "2026-09-06T00:00:00Z",
  updated_at: "2026-09-06T00:00:00Z",
};

let currentProject: ProjectRow = { ...project };
let currentTasks: TaskRow[] = [];

vi.mock("@/hooks/useProjects", () => ({
  useProject: () => ({
    project: currentProject,
    loading: false,
  }),
  useProjectMutations: () => ({ update: vi.fn(), archive: vi.fn() }),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: currentTasks,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: vi.fn(),
    updateTaskStatus: vi.fn(),
  }),
}));

vi.mock("@/hooks/useProjectSections", () => ({
  useProjectSections: () => ({ sections: [], loading: false }),
  useProjectSectionMutations: () => ({
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    isAdminOrMD: true,
    managedDepartments: [],
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title" | "status" | "project_id">): TaskRow {
  return {
    description: null,
    priority: "medium",
    due_date: null,
    start_date: null,
    department_id: null,
    created_by: "u1",
    completed_at: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    assignees: [{ user_id: "u1", name: "Pawan" }],
    ...partial,
  };
}

function renderPage(path = "/projects/7ec222a8-99b2-4e62-b428-b6d585c8a7ef") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectDetailPage", () => {
  it("opens a created project instead of crashing on a missing view helper", () => {
    currentProject = { ...project };
    currentTasks = [];
    renderPage();
    expect(screen.getAllByText("Website rebuild").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Website rebuild/ })).toBeInTheDocument();
    expect(screen.getByText(/Sections/)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /board/i })).toBeInTheDocument();
    expect(screen.getByText("Budget")).toBeInTheDocument();
    expect(screen.getByText("Allocated")).toBeInTheDocument();
    expect(screen.getByText("Launch the new site")).toBeInTheDocument();
  });

  it("hides sections and the full pipeline on workflows, and shows Raise workflow", async () => {
    currentProject = { ...project };
    currentTasks = [];
    renderPage("/projects/7ec222a8-99b2-4e62-b428-b6d585c8a7ef?view=workflows");
    expect(screen.getByTestId("project-workflows-view")).toBeInTheDocument();
    expect(screen.queryByTestId("project-sections-editor")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-pipeline-bar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-pipeline-compact")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No workflows yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /raise workflow/i })).toBeInTheDocument();
    expect(screen.getByText("Raise a multi-stage process for this project.")).toBeInTheDocument();
  });

  it("lists only project-scoped tasks on the board", () => {
    currentProject = { ...project };
    currentTasks = [
      task({ id: "mine", title: "Consignments invoice", status: "todo", project_id: project.id, estimated_hours: 4 }),
      task({ id: "other", title: "Foreign Flipkart bill", status: "todo", project_id: "other-project" }),
    ];
    renderPage("/projects/7ec222a8-99b2-4e62-b428-b6d585c8a7ef?view=board");
    expect(screen.getByText("Consignments invoice")).toBeInTheDocument();
    expect(screen.queryByText("Foreign Flipkart bill")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-pipeline-compact")).toBeInTheDocument();
    expect(screen.queryByTestId("project-pipeline-bar")).not.toBeInTheDocument();
  });

  it("renders unset budget as an em dash in the metric row", () => {
    currentProject = { ...project, budget_amount: null, allocated_hours: null };
    currentTasks = [];
    renderPage();
    const row = screen.getByTestId("project-metric-row");
    expect(row).toHaveTextContent("Budget—");
    expect(row).toHaveTextContent("Allocated—");
    expect(row).not.toHaveTextContent("Budget Allocated Estimated 0h Logged 0h");
  });
});
