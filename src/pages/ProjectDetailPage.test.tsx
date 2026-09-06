import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectDetailPage from "@/pages/ProjectDetailPage";

vi.mock("@/hooks/useProjects", () => ({
  useProject: () => ({
    project: {
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
    },
    loading: false,
  }),
  useProjectMutations: () => ({ update: vi.fn(), archive: vi.fn() }),
}));

vi.mock("@/hooks/useTasks", () => ({
  useTasks: () => ({
    tasks: [],
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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/projects/7ec222a8-99b2-4e62-b428-b6d585c8a7ef"]}>
        <Routes>
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ProjectDetailPage", () => {
  it("opens a created project instead of crashing on a missing view helper", () => {
    renderPage();
    expect(screen.getAllByText("Website rebuild").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Website rebuild/ })).toBeInTheDocument();
    expect(screen.getByText("Sections")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /board/i })).toBeInTheDocument();
    expect(screen.getByText(/Budget/)).toBeInTheDocument();
    expect(screen.getByText(/Allocated/)).toBeInTheDocument();
  });
});
