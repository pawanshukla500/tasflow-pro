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