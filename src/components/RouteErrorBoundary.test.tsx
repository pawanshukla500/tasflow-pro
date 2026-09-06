import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

function Boom() {
  throw new Error("boom");
}

describe("RouteErrorBoundary", () => {
  it("shows a recovery message instead of an empty screen", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("This page failed to load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    spy.mockRestore();
  });
});
