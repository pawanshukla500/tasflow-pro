/**
 * Mindwtr-style project containers and wiki lookups.
 * Tasks belong to a project (optional) and a section that must live in that project.
 * Notes can reference work with [[task:id|Label]] / [[project:id|Label]].
 */

export const INTERNAL_LINK_RE = /\[\[(task|project):([^\]|]+)\|([^\]]+)\]\]/g;
export const INTERNAL_LINK_TOKEN_RE = /^\[\[(task|project):([^\]|]+)\|([^\]]+)\]\]$/;
const LOOKUP_QUERY_RE = /\[\[([^\]]*)$/;

export type EntityKind = "task" | "project";

export type ProjectSectionRow = {
  id: string;
  project_id: string;
  organization_id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LookupEntity = {
  kind: EntityKind;
  id: string;
  title: string;
  status?: string;
};

export type InternalLink = {
  kind: EntityKind;
  id: string;
  label: string;
  raw: string;
};

export type ActiveLookupQuery = {
  start: number;
  end: number;
  query: string;
};

export type ContainerAssignment = {
  projectId?: string | null;
  sectionId?: string | null;
};

export type ContainerResolution =
  | { ok: true; projectId: string | null; sectionId: string | null }
  | { ok: false; error: string };

export function normalizeOptionalId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatInternalLink(kind: EntityKind, id: string, label: string): string {
  const safeLabel = label.replace(/[\[\]]/g, "").trim() || id;
  return `[[${kind}:${id}|${safeLabel}]]`;
}

export function parseInternalLinks(text: string): InternalLink[] {
  const matches: InternalLink[] = [];
  const re = new RegExp(INTERNAL_LINK_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    matches.push({
      kind: match[1] as EntityKind,
      id: match[2].trim(),
      label: match[3].trim(),
      raw: match[0],
    });
  }
  return matches;
}

/** Detect an unfinished `[[query` token at the caret so the editor can offer lookups. */
export function findActiveLookupQuery(value: string, caret: number): ActiveLookupQuery | null {
  const before = value.slice(0, Math.max(0, caret));
  if (/```[\s\S]*$/.test(before) && (before.match(/```/g) || []).length % 2 === 1) return null;
  const lastTick = before.lastIndexOf("`");
  if (lastTick >= 0) {
    const ticksAfter = (before.slice(lastTick + 1).match(/`/g) || []).length;
    if (ticksAfter % 2 === 0 && !before.slice(lastTick + 1).includes("\n")) {
      const open = before.slice(lastTick).startsWith("`") && !before.slice(lastTick + 1).includes("`");
      if (open) return null;
    }
  }
  const match = before.match(LOOKUP_QUERY_RE);
  if (!match) return null;
  const start = before.length - match[0].length;
  return { start, end: caret, query: match[1] };
}

export function insertInternalLink(
  value: string,
  active: ActiveLookupQuery,
  entity: LookupEntity,
): { value: string; caret: number } {
  const token = formatInternalLink(entity.kind, entity.id, entity.title);
  const next = `${value.slice(0, active.start)}${token}${value.slice(active.end)}`;
  return { value: next, caret: active.start + token.length };
}

/** Parse `task:` / `project:` prefixes used by [[ lookup and search APIs. */
export function parseLookupQuery(query: string): { kind: EntityKind | null; needle: string } {
  const raw = query.trim();
  const lower = raw.toLowerCase();
  if (lower.startsWith("task:")) return { kind: "task", needle: raw.slice(5).trim() };
  if (lower.startsWith("project:")) return { kind: "project", needle: raw.slice(8).trim() };
  return { kind: null, needle: raw };
}

export function filterLookupEntities(
  entities: LookupEntity[],
  query: string,
  options: { excludeTaskIds?: string[]; excludeProjectIds?: string[] } = {},
): LookupEntity[] {
  const { kind: kindFilter, needle: rawNeedle } = parseLookupQuery(query);
  const needle = rawNeedle.toLowerCase();
  return entities.filter((entity) => {
    if (entity.kind === "task" && options.excludeTaskIds?.includes(entity.id)) return false;
    if (entity.kind === "project" && options.excludeProjectIds?.includes(entity.id)) return false;
    if (kindFilter && entity.kind !== kindFilter) return false;
    if (!needle) return true;
    return entity.title.toLowerCase().includes(needle) || entity.id.toLowerCase().startsWith(needle);
  });
}

export function resolveTaskContainerAssignment({
  projectId,
  sectionId,
  projects,
  sections,
  projectsLoaded = true,
  sectionsLoaded = true,
}: {
  projectId: unknown;
  sectionId: unknown;
  projects: { id: string }[];
  sections: Pick<ProjectSectionRow, "id" | "project_id">[];
  /** When false, skip "not found" so a save cannot race an in-flight catalog query. */
  projectsLoaded?: boolean;
  sectionsLoaded?: boolean;
}): ContainerResolution {
  const resolvedProjectId = normalizeOptionalId(projectId);
  if (resolvedProjectId && projectsLoaded && !projects.some((project) => project.id === resolvedProjectId)) {
    return { ok: false, error: "Project not found" };
  }

  const resolvedSectionId = normalizeOptionalId(sectionId);
  if (!resolvedSectionId) {
    return { ok: true, projectId: resolvedProjectId, sectionId: null };
  }

  const section = sections.find((candidate) => candidate.id === resolvedSectionId);
  if (!section) {
    if (!sectionsLoaded) {
      return { ok: true, projectId: resolvedProjectId, sectionId: resolvedSectionId };
    }
    return { ok: false, error: "Section not found" };
  }
  if (resolvedProjectId && section.project_id !== resolvedProjectId) {
    return { ok: false, error: "Section does not belong to project" };
  }

  return {
    ok: true,
    projectId: resolvedProjectId || section.project_id,
    sectionId: resolvedSectionId,
  };
}

/** When the project changes, drop a section that no longer belongs. */
export function sectionIdForProject(
  sectionId: string | null | undefined,
  projectId: string | null | undefined,
  sections: Pick<ProjectSectionRow, "id" | "project_id">[],
): string | null {
  const resolved = resolveTaskContainerAssignment({
    projectId,
    sectionId,
    projects: projectId ? [{ id: projectId }] : [],
    sections,
  });
  if (!resolved.ok) return null;
  return resolved.sectionId;
}

export function sortSections<T extends Pick<ProjectSectionRow, "sort_order" | "created_at" | "title">>(
  sections: T[],
): T[] {
  return [...sections].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
    return a.title.localeCompare(b.title);
  });
}

export function firstIncompleteSectionId<T extends { id: string; status: string; section_id?: string | null }>(
  sections: Pick<ProjectSectionRow, "id">[],
  tasks: T[],
): string | null {
  for (const section of sections) {
    const open = tasks.some(
      (task) => task.section_id === section.id && task.status !== "done",
    );
    if (open) return section.id;
  }
  return null;
}
