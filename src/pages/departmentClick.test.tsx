import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import DepartmentsPage from "@/pages/DepartmentsPage";

function table(name: string) {
  const rows: Record<string, unknown[]> = {
    departments: [{ id: "d1", name: "Data Analysis", description: "Numbers", color: "#0d9488" }],
    profiles: [],
    department_managers: [],
    tasks: [],
  };
  const data = rows[name] || [];
  const builder = {
    select() { return builder; },
    order() { return builder; },
    neq() { return builder; },
    eq() { return builder; },
    then(onFulfilled: (value: { data: unknown[] }) => unknown) {
      return Promise.resolve({ data }).then(onFulfilled);
    },
  };
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (name: string) => table(name) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    accessScope: { hasFullAccess: true, tier: "org", canManageDepartments: false },
  }),
}));

vi.mock("@/hooks/useAccessScope", () => ({
  useAccessScope: () => ({
    filterDepartments: (rows: unknown[]) => rows,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function TeamProbe() {
  const [params] = useSearchParams();
  return <div>Team {params.get("dept")}</div>;
}

describe("department card", () => {
  it("opens that department in the team directory", async () => {
    render(
      <MemoryRouter initialEntries={["/departments"]}>
        <Routes>
          <Route path="/departments" element={<DepartmentsPage />} />
          <Route path="/team" element={<TeamProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "View team" }));
    expect(screen.getByText("Team d1")).toBeInTheDocument();
  });
});
