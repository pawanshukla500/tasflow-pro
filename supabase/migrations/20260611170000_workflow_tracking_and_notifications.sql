-- Workflow tracking numbers: WF-YYYYMMDD-000001 (unique, atomic per day).

CREATE TABLE IF NOT EXISTS public.workflow_tracking_counters (
  day_key TEXT PRIMARY KEY,
  last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_workflow_tracking_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d TEXT;
  seq INTEGER;
BEGIN
  d := to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');
  INSERT INTO public.workflow_tracking_counters (day_key, last_seq)
  VALUES (d, 1)
  ON CONFLICT (day_key) DO UPDATE
    SET last_seq = public.workflow_tracking_counters.last_seq + 1
  RETURNING last_seq INTO seq;
  RETURN 'WF-' || d || '-' || lpad(seq::TEXT, 6, '0');
END;
$$;

-- Backward-compatible alias
CREATE OR REPLACE FUNCTION public.generate_workflow_indent_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_workflow_tracking_number();
END;
$$;

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_tracking_number
  ON public.workflows (tracking_number)
  WHERE tracking_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_workflow_tracking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tracking_number IS NULL OR length(trim(NEW.tracking_number)) = 0 THEN
    NEW.tracking_number := public.generate_workflow_tracking_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_workflow_tracking ON public.workflows;
CREATE TRIGGER trg_set_workflow_tracking
  BEFORE INSERT ON public.workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_workflow_tracking_number();

CREATE OR REPLACE FUNCTION public.auto_workflow_reference_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing TEXT;
  ref_val TEXT;
BEGIN
  SELECT value INTO existing FROM public.workflow_field_values
    WHERE workflow_id = NEW.id AND field_key = 'reference_id' LIMIT 1;

  ref_val := COALESCE(NULLIF(trim(NEW.tracking_number), ''), public.generate_workflow_tracking_number());

  IF existing IS NULL OR length(trim(existing)) = 0 THEN
    INSERT INTO public.workflow_field_values (workflow_id, field_key, label, value)
      VALUES (NEW.id, 'reference_id', 'Tracking Number', ref_val);
  ELSE
    UPDATE public.workflow_field_values
      SET value = ref_val, label = 'Tracking Number'
      WHERE workflow_id = NEW.id AND field_key = 'reference_id';
  END IF;

  IF NEW.tracking_number IS NULL OR length(trim(NEW.tracking_number)) = 0 THEN
    UPDATE public.workflows SET tracking_number = ref_val WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill tracking_number from reference_id or generate new WF numbers
UPDATE public.workflows w
SET tracking_number = v.value
FROM public.workflow_field_values v
WHERE v.workflow_id = w.id
  AND v.field_key = 'reference_id'
  AND w.tracking_number IS NULL
  AND v.value LIKE 'WF-%';

UPDATE public.workflows w
SET tracking_number = public.generate_workflow_tracking_number()
WHERE w.tracking_number IS NULL;

UPDATE public.workflow_field_values v
SET value = w.tracking_number, label = 'Tracking Number'
FROM public.workflows w
WHERE w.id = v.workflow_id
  AND v.field_key = 'reference_id'
  AND w.tracking_number IS NOT NULL
  AND (v.value IS NULL OR v.value NOT LIKE 'WF-%' OR v.value <> w.tracking_number);

CREATE INDEX IF NOT EXISTS idx_workflows_tracking_search
  ON public.workflows (tracking_number text_pattern_ops);

GRANT EXECUTE ON FUNCTION public.generate_workflow_tracking_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_workflow_tracking_number() TO authenticated;
