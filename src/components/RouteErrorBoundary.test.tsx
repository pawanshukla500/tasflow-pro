import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";

function Boom() {
  throw new Error("boom");
}

function Harness() {
  const [resetKey, setResetKey] = useState("/projects/p1");
  const [ok, setOk] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => { setOk(true); setResetKey("/projects/p1?view=list"); }}>
        Change view
      </button>
      <RouteErrorBoundary resetKey={resetKey}>
        {ok ? <p>Recovered</p> : <Boom />}
      </RouteErrorBoundary>
    </div>
  );
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

  it("clears the fallback when the route query changes", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Harness />);
    expect(screen.getByText("This page failed to load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Change view" }));
    expect(screen.getByText("Recovered")).toBeInTheDocument();
    spy.mockRestore();
  });
});
