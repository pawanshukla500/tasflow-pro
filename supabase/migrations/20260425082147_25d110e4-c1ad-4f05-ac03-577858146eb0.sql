-- Workflow templates
CREATE TABLE public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.workflow_template_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  owner_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  default_tat_hours INTEGER NOT NULL DEFAULT 24,
  escalate_on_breach BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, position)
);

-- Workflow instances
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_stage_position INTEGER NOT NULL DEFAULT 1,
  raised_by UUID,
  raised_by_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.workflow_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  owner_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assignee_user_id UUID,
  tat_hours INTEGER NOT NULL DEFAULT 24,
  escalate_on_breach BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  escalated_at TIMESTAMPTZ,
  notes TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, position)
);

CREATE INDEX idx_workflow_stages_workflow ON public.workflow_stages(workflow_id);
CREATE INDEX idx_workflow_stages_assignee ON public.workflow_stages(assignee_user_id);
CREATE INDEX idx_workflow_stages_dept ON public.workflow_stages(owner_department_id);
CREATE INDEX idx_workflow_template_stages_template ON public.workflow_template_stages(template_id);

-- Updated_at trigger
CREATE TRIGGER update_workflow_templates_updated_at BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: is user assignee or dept member of any stage in workflow
CREATE OR REPLACE FUNCTION public.user_in_workflow(_user_id UUID, _workflow_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workflows w WHERE w.id = _workflow_id AND w.raised_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.workflow_stages s
    WHERE s.workflow_id = _workflow_id
      AND (s.assignee_user_id = _user_id
           OR (s.owner_department_id IS NOT NULL AND public.manages_department(_user_id, s.owner_department_id)))
  );
$$;

-- Enable RLS
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_template_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_stages ENABLE ROW LEVEL SECURITY;

-- Templates: anyone can view, MD/Admin/Dept Mgr can manage
CREATE POLICY "View templates" ON public.workflow_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage templates" ON public.workflow_templates FOR ALL TO authenticated
  USING (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_managers WHERE user_id = auth.uid()))
  WITH CHECK (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_managers WHERE user_id = auth.uid()));

CREATE POLICY "View template stages" ON public.workflow_template_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage template stages" ON public.workflow_template_stages FOR ALL TO authenticated
  USING (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_managers WHERE user_id = auth.uid()))
  WITH CHECK (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM public.department_managers WHERE user_id = auth.uid()));

-- Workflows: visibility
CREATE POLICY "View relevant workflows" ON public.workflows FOR SELECT TO authenticated
  USING (is_admin_or_md(auth.uid()) OR raised_by = auth.uid() OR public.user_in_workflow(auth.uid(), id));

CREATE POLICY "Anyone signed-in can raise workflow" ON public.workflows FOR INSERT TO authenticated
  WITH CHECK (raised_by = auth.uid());

CREATE POLICY "Admins/managers/raisers update workflow" ON public.workflows FOR UPDATE TO authenticated
  USING (is_admin_or_md(auth.uid()) OR raised_by = auth.uid() OR public.user_in_workflow(auth.uid(), id));

CREATE POLICY "Admins delete workflow" ON public.workflows FOR DELETE TO authenticated
  USING (is_admin_or_md(auth.uid()));

-- Workflow stages
CREATE POLICY "View workflow stages" ON public.workflow_stages FOR SELECT TO authenticated
  USING (is_admin_or_md(auth.uid()) OR public.user_in_workflow(auth.uid(), workflow_id)
         OR EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));

CREATE POLICY "Insert workflow stages" ON public.workflow_stages FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_md(auth.uid())
              OR EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));

CREATE POLICY "Update own workflow stages" ON public.workflow_stages FOR UPDATE TO authenticated
  USING (is_admin_or_md(auth.uid())
         OR assignee_user_id = auth.uid()
         OR (owner_department_id IS NOT NULL AND manages_department(auth.uid(), owner_department_id))
         OR EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));

CREATE POLICY "Delete workflow stages" ON public.workflow_stages FOR DELETE TO authenticated
  USING (is_admin_or_md(auth.uid()));