import { describe, expect, it } from "vitest";
import {
  isProjectView,
  isProjectDetailPath,
  projectProgress,
  remapRetiredInboxPath,
  PROJECT_VIEWS,
} from "@/lib/projects";

describe("projectProgress", () => {
  it("returns 0 when there are no tasks", () => {
    expect(projectProgress(0, 0)).toBe(0);
  });

  it("rounds percent complete", () => {
    expect(projectProgress(1, 3)).toBe(33);
    expect(projectProgress(2, 3)).toBe(67);
    expect(projectProgress(3, 3)).toBe(100);
  });
});

describe("isProjectView", () => {
  it("accepts AppFlowy-style database views", () => {
    for (const view of PROJECT_VIEWS) {
      expect(isProjectView(view)).toBe(true);
    }
    expect(isProjectView("inbox")).toBe(false);
    expect(isProjectView(undefined)).toBe(false);
  });
});

describe("isProjectDetailPath", () => {
  it("matches a project id with or without a trailing slash", () => {
    expect(isProjectDetailPath("/projects/b1222b62-c4b5-44df-b031-bbe2c0775286")).toBe(true);
    expect(isProjectDetailPath("/projects/b1222b62-c4b5-44df-b031-bbe2c0775286/")).toBe(true);
  });

  it("does not match the projects index", () => {
    expect(isProjectDetailPath("/projects")).toBe(false);
    expect(isProjectDetailPath("/projects/")).toBe(false);
  });
});

describe("remapRetiredInboxPath", () => {
  it("sends Inbox bookmarks to Projects", () => {
    expect(remapRetiredInboxPath("/inbox")).toBe("/projects");
    expect(remapRetiredInboxPath("/inbox/abc")).toBe("/projects");
    expect(remapRetiredInboxPath("/inbox?tab=chat")).toBe("/projects");
  });

  it("leaves other paths unchanged", () => {
    expect(remapRetiredInboxPath("/my-tasks")).toBe("/my-tasks");
  });
});
