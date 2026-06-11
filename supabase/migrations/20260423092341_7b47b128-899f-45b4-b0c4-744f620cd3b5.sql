
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  category text NOT NULL DEFAULT 'general',
  target_value numeric NOT NULL DEFAULT 0,
  current_value numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  deadline date,
  status text NOT NULL DEFAULT 'on_track',
  priority text NOT NULL DEFAULT 'medium',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER goals_set_updated_at
BEFORE UPDATE ON public.goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated can view goals"
ON public.goals FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage goals"
ON public.goals FOR ALL TO authenticated
USING (public.is_admin_or_md(auth.uid()))
WITH CHECK (public.is_admin_or_md(auth.uid()));

CREATE POLICY "Dept managers insert goals"
ON public.goals FOR INSERT TO authenticated
WITH CHECK (department_id IS NOT NULL AND public.manages_department(auth.uid(), department_id));

CREATE POLICY "Dept managers update goals"
ON public.goals FOR UPDATE TO authenticated
USING (department_id IS NOT NULL AND public.manages_department(auth.uid(), department_id))
WITH CHECK (department_id IS NOT NULL AND public.manages_department(auth.uid(), department_id));

CREATE POLICY "Dept managers delete goals"
ON public.goals FOR DELETE TO authenticated
USING (department_id IS NOT NULL AND public.manages_department(auth.uid(), department_id));
