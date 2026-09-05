import { describe, expect, it } from "vitest";
import { summarizeProjectPipeline, taskMatchesStatus } from "./projectPipeline";

function task(partial: { id: string; status: string; due_date?: string | null }) {
  return {
    id: partial.id,
    status: partial.status,
    due_date: partial.due_date ?? null,
  };
}

describe("taskMatchesStatus", () => {
  it("maps legacy in_review onto the Pending Review column", () => {
    expect(taskMatchesStatus("in_review", "pending_review")).toBe(true);
    expect(taskMatchesStatus("pending_review", "pending_review")).toBe(true);
    expect(taskMatchesStatus("in_review", "in_progress")).toBe(false);
  });
});

describe("summarizeProjectPipeline", () => {
  it("treats an empty project as not started", () => {
    const summary = summarizeProjectPipeline([]);
    expect(summary.health).toBe("not_started");
    expect(summary.currentStepId).toBe("todo");
    expect(summary.percentComplete).toBe(0);
  });

  it("marks a fully completed project as complete", () => {
    const summary = summarizeProjectPipeline([
      task({ id: "1", status: "done" }),
      task({ id: "2", status: "done" }),
    ]);
    expect(summary.health).toBe("complete");
    expect(summary.currentStepId).toBe("done");
    expect(summary.percentComplete).toBe(100);
    expect(summary.done).toBe(2);
  });

  it("uses In Progress as the current step when work is underway", () => {
    const summary = summarizeProjectPipeline([
      task({ id: "1", status: "todo" }),
      task({ id: "2", status: "in_progress" }),
      task({ id: "3", status: "done" }),
    ]);
    expect(summary.health).toBe("in_progress");
    expect(summary.currentStepId).toBe("in_progress");
    expect(summary.counts.todo).toBe(1);
    expect(summary.percentComplete).toBe(33);
  });

  it("counts in_review with pending review", () => {
    const summary = summarizeProjectPipeline([
      task({ id: "1", status: "in_review" }),
      task({ id: "2", status: "pending_review" }),
    ]);
    expect(summary.counts.pending_review).toBe(2);
    expect(summary.currentStepId).toBe("pending_review");
  });

  it("flags delayed when open tasks are overdue", () => {
    const summary = summarizeProjectPipeline(
      [task({ id: "1", status: "todo", due_date: "2026-08-01" })],
      "2026-09-05",
    );
    expect(summary.health).toBe("delayed");
    expect(summary.overdue).toBe(1);
  });

  it("flags blocked ahead of delayed", () => {
    const summary = summarizeProjectPipeline(
      [
        task({ id: "1", status: "blocked", due_date: "2026-08-01" }),
        task({ id: "2", status: "todo" }),
      ],
      "2026-09-05",
    );
    expect(summary.health).toBe("blocked");
    expect(summary.currentStepId).toBe("todo");
  });
});
