import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ReportsPage from "@/pages/ReportsPage";
import CalendarPage from "@/pages/CalendarPage";
import { todayIST } from "@/lib/time";

const builder = {
  select() { return builder; },
  eq() { return builder; },
  order() { return builder; },
  gte() { return builder; },
  then(onFulfilled: (value: { data: never[] }) => unknown) {
    return Promise.resolve({ data: [] }).then(onFulfilled);
  },
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => builder },
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: [{
      id: "task-1",
      title: "Vendor contract review",
      due_date: todayIST(),
      priority: "high",
      status: "todo",
      assignees: [],
    }],
    loading: false,
    fetchTasks: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePerformance", () => ({
  usePerformance: () => ({ metrics: [], loading: false }),
}));

vi.mock("@/hooks/useUserRolesMap", () => ({
  useUserRolesMap: () => new Map(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    accessScope: { hasFullAccess: true, tier: "org", isManager: true, isHR: false, departmentIds: null },
  }),
}));

vi.mock("@/hooks/useAccessScope", () => ({
  useAccessScope: () => ({
    filterDepartments: (rows: unknown[]) => rows,
    filterProfiles: (rows: unknown[]) => rows,
    filterTasks: (rows: unknown[]) => rows,
  }),
}));

vi.mock("@/lib/googleIntegration", () => ({
  calendarRangeForMonth: () => ({}),
  getGoogleConnection: async () => null,
  listGoogleCalendarEvents: async () => [],
  syncGoogleCalendar: async () => {},
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("report and calendar clicks", () => {
  it("switches the reports view to workflows", async () => {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserver);
    render(
      <MemoryRouter>
        <ReportsPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Workflows" }));
    expect(await screen.findByText("Stages tracked (30d)")).toBeInTheDocument();
  });

  it("shows a day's tasks after that day is chosen", () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    const today = todayIST();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(today) }));
    expect(screen.getAllByText("Vendor contract review").length).toBeGreaterThan(0);
  });
});
