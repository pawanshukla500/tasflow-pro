import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectBoardView } from "@/components/ProjectBoardView";
import type { TaskRow } from "@/lib/tasksApi";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    isAdminOrMD: true,
    managedDepartments: [],
  }),
}));

function task(partial: Partial<TaskRow> & Pick<TaskRow, "id" | "title" | "status">): TaskRow {
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
    assignees: [{ user_id: "u1", name: "Pawan Shukla" }],
    ...partial,
  };
}

describe("ProjectBoardView", () => {
  it("renders all five pipeline columns including Blocked", () => {
    const columnRefs = { current: {} };
    render(
      <ProjectBoardView
        tasks={[
          task({ id: "1", title: "Invoice", status: "todo" }),
          task({ id: "2", title: "Review pack", status: "in_review" }),
        ]}
        focusStatus={null}
        columnRefs={columnRefs}
        onCreateInStatus={() => {}}
        onOpenTask={() => {}}
        onMoveTask={async () => null}
      />,
    );

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Pending Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Invoice")).toBeInTheDocument();
    expect(screen.getByText("Review pack")).toBeInTheDocument();
  });
});
