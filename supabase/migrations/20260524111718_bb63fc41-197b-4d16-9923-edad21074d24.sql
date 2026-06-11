
CREATE OR REPLACE FUNCTION public.is_hr(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'hr')
$$;

CREATE POLICY "HR can view all tasks" ON public.tasks
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all workflows" ON public.workflows
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all workflow stages" ON public.workflow_stages
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all workflow field values" ON public.workflow_field_values
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all workflow stage comments" ON public.workflow_stage_comments
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all workflow stage events" ON public.workflow_stage_events
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all KPIs" ON public.kpis
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all KRAs" ON public.kras
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all notification logs" ON public.notification_log
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can view all task attachments" ON public.task_attachments
  FOR SELECT TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can create tasks" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_hr(auth.uid()) AND created_by = auth.uid());

CREATE POLICY "HR can update tasks" ON public.tasks
  FOR UPDATE TO authenticated USING (public.is_hr(auth.uid()));

CREATE POLICY "HR can manage task assignees" ON public.task_assignees
  FOR ALL TO authenticated USING (public.is_hr(auth.uid())) WITH CHECK (public.is_hr(auth.uid()));
