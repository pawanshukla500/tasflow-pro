import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      roles: ["system_admin"],
      organization: {
        id: "org1",
        name: "Youthnic",
        domain: "vbexports.co.in",
        domain_type: "custom",
        settings: { email: { daily_digest_enabled: true } },
      },
    },
    isAdminOrMD: true,
    refetchProfile: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

describe("AdminSettingsPanel daily digest controls", () => {
  it("lets an admin check names/numbers and send today's digest", async () => {
    render(<AdminSettingsPanel />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /daily digest check & send/i })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /check who would get it/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send today's digest/i })).toBeInTheDocument();
    expect(screen.getAllByText(/10:00 AM IST/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+91 XXXXXXXXXX/)).toBeInTheDocument();
  });
});
