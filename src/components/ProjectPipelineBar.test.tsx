import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectPipelineBar } from "@/components/ProjectPipelineBar";
import type { ProjectPipelineSummary } from "@/lib/projectPipeline";

const summary: ProjectPipelineSummary = {
  total: 26,
  done: 8,
  open: 18,
  overdue: 2,
  percentComplete: 31,
  currentStepId: "in_progress",
  health: "delayed",
  healthLabel: "Delayed",
  counts: {
    todo: 16,
    in_progress: 2,
    pending_review: 0,
    done: 8,
    blocked: 0,
  },
};

describe("ProjectPipelineBar", () => {
  it("shows health, done count, and every pipeline step", () => {
    render(<ProjectPipelineBar summary={summary} focusStatus={null} onSelectStep={() => {}} />);

    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.getByText(/of/)).toBeInTheDocument();
    expect(screen.getByLabelText("To Do, 16 tasks")).toBeInTheDocument();
    expect(screen.getByLabelText("In Progress, 2 tasks")).toBeInTheDocument();
    expect(screen.getByLabelText("Pending Review, 0 tasks")).toBeInTheDocument();
    expect(screen.getByLabelText("Done, 8 tasks")).toBeInTheDocument();
    expect(screen.getByLabelText("Blocked, 0 tasks")).toBeInTheDocument();
    expect(screen.getByText(/2 overdue/)).toBeInTheDocument();
  });

  it("notifies when a step is clicked", () => {
    const onSelectStep = vi.fn();
    render(<ProjectPipelineBar summary={summary} focusStatus="todo" onSelectStep={onSelectStep} />);
    fireEvent.click(screen.getByRole("button", { name: /pending review/i }));
    expect(onSelectStep).toHaveBeenCalledWith("pending_review");
  });
});
