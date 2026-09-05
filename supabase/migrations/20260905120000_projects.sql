-- AppFlowy-style spaces: projects group tasks + workflows, with multiple views
-- of the same work (board / list / calendar / workflows). Inbox remains in the
-- chat tables but is no longer a product surface.

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT '📁',
  color text NOT NULL DEFAULT '#0D9488',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  default_view text NOT NULL DEFAULT 'board'
    CHECK (default_view IN ('board', 'list', 'calendar', 'workflows')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_projects_org_status
  ON public.projects (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_department
  ON public.projects (department_id)
  WHERE department_id IS NOT NULL;

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View projects in org" ON public.projects;
CREATE POLICY "View projects in org"
  ON public.projects FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.user_organization_id(auth.uid())
    OR public.is_admin_or_md(auth.uid())
  );

DROP POLICY IF EXISTS "Members create projects in org" ON public.projects;
CREATE POLICY "Members create projects in org"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_md(auth.uid())
    OR organization_id = public.user_organization_id(auth.uid())
  );

DROP POLICY IF EXISTS "Members update projects in org" ON public.projects;
CREATE POLICY "Members update projects in org"
  ON public.projects FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR organization_id = public.user_organization_id(auth.uid())
  )
  WITH CHECK (
    public.is_admin_or_md(auth.uid())
    OR organization_id = public.user_organization_id(auth.uid())
  );

DROP POLICY IF EXISTS "Creators and admins delete projects" ON public.projects;
CREATE POLICY "Creators and admins delete projects"
  ON public.projects FOR DELETE TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR created_by = auth.uid()
    OR (
      organization_id = public.user_organization_id(auth.uid())
      AND public.is_org_admin(auth.uid(), organization_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

-- Tasks and workflows live inside a project (nullable so existing rows stay valid).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id
  ON public.tasks (project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_project_id
  ON public.workflows (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON TABLE public.projects IS
  'Workspace spaces (AppFlowy-style). Tasks and workflows optionally belong to a project; board/list/calendar/workflows are views of that data.';
