import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MyTasks from "@/pages/MyTasks";
import type { TaskRow } from "@/lib/tasksApi";

let currentTasks: TaskRow[] = [];
let currentTotal: number | null = 2;
let currentHasMore = false;
let canCreateTasks = true;

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: currentTasks,
    loading: false,
    loadingMore: false,
    hasMore: currentHasMore,
    total: currentTotal,
    fetchTasks: vi.fn(),
    updateTaskStatus: vi.fn(),
    deleteTask: vi.fn(),
    loadMore: vi.fn(),
  }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", profile: { department_id: "d1", organization_id: "org1", name: "Pawan" } },
    isAdminOrMD: true,
    isDeptManager: false,
    isHR: false,
    accessScope: { canCreateTasks },
    managedDepartments: [],
  }),
}));

vi.mock("@/hooks/useAccessScope", () => ({
  useAccessScope: () => ({
    filterTasks: <T,>(tasks: T[]) => tasks,
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [], error: null }),
          then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock("@/components/CreateTaskModal", () => ({ default: () => null }));
vi.mock("@/components/EditTaskModal", () => ({ default: () => null }));
vi.mock("@/components/CompleteTaskDialog", () => ({ default: () => null }));
vi.mock("@/components/TaskReviewDialog", () => ({ default: () => null }));
vi.mock("@/components/ImportTasksModal", () => ({ default: () => null }));

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    description: null,
    status: "todo",
    priority: "medium",
    due_date: "2026-09-08",
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

function renderPage() {
  return render(
    <MemoryRouter>
      <MyTasks />
    </MemoryRouter>,
  );
}

describe("MyTasks page", () => {
  it("renders header, metric chips, tabs, and a task row", async () => {
    currentHasMore = true;
    currentTotal = 12;
    currentTasks = [
      task({
        id: "t1",
        title: "Ship catalog",
        project_name: "Website Redesign",
        estimated_hours: 4,
        logged_hours: 1.5,
        due_date: "2026-09-08",
      }),
    ];
    renderPage();

    await waitFor(() => expect(screen.getByTestId("my-tasks-page")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "My Tasks" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 12")).toBeInTheDocument();
    expect(screen.getByTestId("my-tasks-metric-row")).toHaveTextContent("Overdue");
    expect(screen.getByTestId("my-tasks-metric-row")).toHaveTextContent("Due today");
    expect(screen.getByRole("tab", { name: /Assigned to me/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /All/ })).toBeInTheDocument();
    expect(screen.getByText("Ship catalog")).toBeInTheDocument();
    expect(screen.getByText("Website Redesign")).toBeInTheDocument();
    expect(screen.getByText("4h / 1.5h")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New task/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Load more/ })).toBeInTheDocument();
  });

  it("shows a compact empty state with a create CTA", async () => {
    currentTasks = [];
    currentTotal = 0;
    currentHasMore = false;
    canCreateTasks = true;
    renderPage();
    await waitFor(() => expect(screen.getByText("No tasks in this view.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Create task/ })).toBeInTheDocument();
    expect(screen.queryByText("Create your first task")).not.toBeInTheDocument();
  });
});
