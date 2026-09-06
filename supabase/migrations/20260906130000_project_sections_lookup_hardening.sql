-- Follow-up for hosts that already applied 20260906120000:
-- always copy org from the parent project, forbid moving sections,
-- and assign sort_order under an advisory lock.

CREATE OR REPLACE FUNCTION public.project_sections_fill_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    RAISE EXCEPTION 'A section cannot be moved to another project';
  END IF;
  SELECT organization_id INTO NEW.organization_id
  FROM public.projects
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_sections_fill_org ON public.project_sections;
CREATE TRIGGER project_sections_fill_org
BEFORE INSERT OR UPDATE ON public.project_sections
FOR EACH ROW EXECUTE FUNCTION public.project_sections_fill_org();

CREATE OR REPLACE FUNCTION public.project_sections_assign_sort()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(98133421, hashtext(NEW.project_id::text));
  SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO NEW.sort_order
    FROM public.project_sections
    WHERE project_id = NEW.project_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS project_sections_assign_sort ON public.project_sections;
CREATE TRIGGER project_sections_assign_sort
BEFORE INSERT ON public.project_sections
FOR EACH ROW EXECUTE FUNCTION public.project_sections_assign_sort();
