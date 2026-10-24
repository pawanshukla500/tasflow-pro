import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScratchNotesPanel } from "@/components/ScratchNotesPanel";

const deletedIds: string[] = [];
const auth = vi.hoisted(() => ({ user: { id: "u1" } }));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          if (column === "id") deletedIds.push(value);
          return {
            eq: async () => ({ error: null }),
            lt: async () => ({ error: null }),
          };
        },
      }),
      select: () => ({
        eq: () => ({
          gt: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  id: "n1",
                  content: "Call the vendor",
                  polished_content: null,
                  created_at: "2026-10-21T08:00:00Z",
                  updated_at: "2026-10-21T08:00:00Z",
                  expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
                }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  },
}));

describe("ScratchNotesPanel", () => {
  it("shows how long a private note has left and can delete it", async () => {
    deletedIds.length = 0;
    render(<ScratchNotesPanel />);
    expect(await screen.findByText("Call the vendor")).toBeInTheDocument();
    expect(screen.getByText(/\d+ days left/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(deletedIds).toContain("n1");
  });
});
