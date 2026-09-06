import { describe, expect, it } from "vitest";
import {
  filterLookupEntities,
  findActiveLookupQuery,
  firstIncompleteSectionId,
  formatInternalLink,
  insertInternalLink,
  parseInternalLinks,
  parseLookupQuery,
  resolveTaskContainerAssignment,
  sectionIdForProject,
} from "./projectLookup";

const projects = [{ id: "p1" }, { id: "p2" }];
const sections = [
  { id: "s1", project_id: "p1" },
  { id: "s2", project_id: "p2" },
];

describe("wiki lookup links", () => {
  it("parses task and project tokens", () => {
    const links = parseInternalLinks("See [[project:p1|Website]] and [[task:t1|Draft copy]]");
    expect(links).toEqual([
      { kind: "project", id: "p1", label: "Website", raw: "[[project:p1|Website]]" },
      { kind: "task", id: "t1", label: "Draft copy", raw: "[[task:t1|Draft copy]]" },
    ]);
  });

  it("detects an unfinished [[ query at the caret", () => {
    const value = "Link [[web";
    expect(findActiveLookupQuery(value, value.length)).toEqual({
      start: 5,
      end: value.length,
      query: "web",
    });
    expect(findActiveLookupQuery("ok [[project:p1|Website]] done", 28)).toBeNull();
  });

  it("inserts a stable token for the chosen entity", () => {
    const value = "See [[web";
    const active = findActiveLookupQuery(value, value.length)!;
    const next = insertInternalLink(value, active, { kind: "project", id: "p1", title: "Website" });
    expect(next.value).toBe("See [[project:p1|Website]]");
    expect(formatInternalLink("task", "t1", "Q1 [plan]")).toBe("[[task:t1|Q1 plan]]");
  });

  it("filters lookup results by title and kind prefix", () => {
    const entities = [
      { kind: "project" as const, id: "p1", title: "Website" },
      { kind: "task" as const, id: "t1", title: "Website copy" },
      { kind: "task" as const, id: "t2", title: "Ignore me" },
    ];
    expect(filterLookupEntities(entities, "web").map((e) => e.id)).toEqual(["p1", "t1"]);
    expect(filterLookupEntities(entities, "task:copy").map((e) => e.id)).toEqual(["t1"]);
    expect(filterLookupEntities(entities, "project:web").map((e) => e.id)).toEqual(["p1"]);
    expect(filterLookupEntities(entities, "", { excludeTaskIds: ["t1"] }).map((e) => e.id)).toEqual(["p1", "t2"]);
  });

  it("keeps lookup kind when stripping task:/project: prefixes", () => {
    expect(parseLookupQuery("task:copy")).toEqual({ kind: "task", needle: "copy" });
    expect(parseLookupQuery("Project:Website")).toEqual({ kind: "project", needle: "Website" });
    expect(parseLookupQuery("  web  ")).toEqual({ kind: null, needle: "web" });
  });
});

describe("task container lookup", () => {
  it("accepts a project without a section", () => {
    expect(resolveTaskContainerAssignment({ projectId: "p1", sectionId: "", projects, sections })).toEqual({
      ok: true,
      projectId: "p1",
      sectionId: null,
    });
  });

  it("rejects unknown projects and sections", () => {
    expect(resolveTaskContainerAssignment({ projectId: "missing", sectionId: null, projects, sections }).ok).toBe(false);
    expect(resolveTaskContainerAssignment({ projectId: "p1", sectionId: "nope", projects, sections }).ok).toBe(false);
  });

  it("rejects a section from another project and infers project from a valid section", () => {
    expect(resolveTaskContainerAssignment({ projectId: "p1", sectionId: "s2", projects, sections })).toEqual({
      ok: false,
      error: "Section does not belong to project",
    });
    expect(resolveTaskContainerAssignment({ projectId: null, sectionId: "s1", projects, sections })).toEqual({
      ok: true,
      projectId: "p1",
      sectionId: "s1",
    });
  });

  it("keeps an existing section while the section catalog is still loading", () => {
    expect(
      resolveTaskContainerAssignment({
        projectId: "p1",
        sectionId: "s1",
        projects,
        sections: [],
        sectionsLoaded: false,
      }),
    ).toEqual({ ok: true, projectId: "p1", sectionId: "s1" });
  });

  it("clears the section when the project changes", () => {
    expect(sectionIdForProject("s1", "p2", sections)).toBeNull();
    expect(sectionIdForProject("s1", "p1", sections)).toBe("s1");
  });

  it("picks the first incomplete section for sequential flow", () => {
    const ordered = [{ id: "s1" }, { id: "s2" }];
    expect(
      firstIncompleteSectionId(ordered, [
        { id: "t1", status: "done", section_id: "s1" },
        { id: "t2", status: "todo", section_id: "s2" },
      ]),
    ).toBe("s2");
  });
});
