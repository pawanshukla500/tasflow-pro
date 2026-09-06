-- Mindwtr-style project containers: ordered sections, lookup-safe FKs,
-- and optional project schedule / sequential flow.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS flow_mode text NOT NULL DEFAULT 'parallel';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_flow_mode_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_flow_mode_check
      CHECK (flow_mode IN ('parallel', 'sequential'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_sections_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_project_sections_project_order
  ON public.project_sections (project_id, sort_order, created_at);

DROP TRIGGER IF EXISTS project_sections_set_updated_at ON public.project_sections;
CREATE TRIGGER project_sections_set_updated_at
BEFORE UPDATE ON public.project_sections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.project_sections_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.projects
    WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_sections_fill_org ON public.project_sections;
CREATE TRIGGER project_sections_fill_org
BEFORE INSERT OR UPDATE OF project_id ON public.project_sections
FOR EACH ROW EXECUTE FUNCTION public.project_sections_fill_org();

ALTER TABLE public.project_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View project sections in org" ON public.project_sections;
CREATE POLICY "View project sections in org"
  ON public.project_sections FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id(auth.uid())
    OR public.is_admin_or_md(auth.uid())
  );

DROP POLICY IF EXISTS "Members write project sections in org" ON public.project_sections;
CREATE POLICY "Members write project sections in org"
  ON public.project_sections FOR ALL TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR organization_id = public.user_organization_id(auth.uid())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND (
      public.is_admin_or_md(auth.uid())
      OR organization_id = public.user_organization_id(auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_sections TO authenticated;
GRANT ALL ON public.project_sections TO service_role;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.project_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_section_id
  ON public.tasks (section_id)
  WHERE section_id IS NOT NULL;

-- Lookup rule: a section must belong to the task's project; otherwise drop it.
CREATE OR REPLACE FUNCTION public.tasks_resolve_section_lookup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  section_project uuid;
BEGIN
  IF NEW.section_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id IS NULL THEN
    NEW.section_id := NULL;
    RETURN NEW;
  END IF;
  SELECT project_id INTO section_project
  FROM public.project_sections
  WHERE id = NEW.section_id;
  IF section_project IS NULL OR section_project IS DISTINCT FROM NEW.project_id THEN
    NEW.section_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_resolve_section_lookup ON public.tasks;
CREATE TRIGGER tasks_resolve_section_lookup
BEFORE INSERT OR UPDATE OF project_id, section_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_resolve_section_lookup();

COMMENT ON TABLE public.project_sections IS
  'Ordered workstreams inside a project (Mindwtr-style sections). Tasks look up a section only when it belongs to the same project.';
COMMENT ON COLUMN public.projects.flow_mode IS
  'parallel = any task can be next; sequential = first incomplete task/section is current.';
COMMENT ON COLUMN public.tasks.section_id IS
  'Optional project section lookup. Cleared when the section is missing or belongs to another project.';
