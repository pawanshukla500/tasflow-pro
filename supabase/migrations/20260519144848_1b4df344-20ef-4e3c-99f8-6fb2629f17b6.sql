
CREATE SEQUENCE IF NOT EXISTS public.workflow_indent_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_workflow_indent_id()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  n bigint;
BEGIN
  n := nextval('public.workflow_indent_seq');
  RETURN 'IND-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_workflow_reference_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing text;
  new_ref text;
BEGIN
  SELECT value INTO existing FROM public.workflow_field_values
    WHERE workflow_id = NEW.id AND field_key = 'reference_id' LIMIT 1;
  IF existing IS NULL OR length(trim(existing)) = 0 THEN
    new_ref := public.generate_workflow_indent_id();
    INSERT INTO public.workflow_field_values (workflow_id, field_key, label, value)
      VALUES (NEW.id, 'reference_id', 'Reference / Indent ID', new_ref);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workflows_auto_reference_id ON public.workflows;
CREATE TRIGGER workflows_auto_reference_id
AFTER INSERT ON public.workflows
FOR EACH ROW EXECUTE FUNCTION public.auto_workflow_reference_id();

-- Backfill existing workflows missing a reference_id
INSERT INTO public.workflow_field_values (workflow_id, field_key, label, value)
SELECT w.id, 'reference_id', 'Reference / Indent ID', public.generate_workflow_indent_id()
FROM public.workflows w
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_field_values v
  WHERE v.workflow_id = w.id AND v.field_key = 'reference_id'
);
