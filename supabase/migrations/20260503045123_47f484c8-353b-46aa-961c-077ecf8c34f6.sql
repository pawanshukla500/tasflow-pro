CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_attachments_task_id ON public.task_attachments(task_id);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View task attachments"
ON public.task_attachments FOR SELECT TO authenticated
USING (
  is_admin_or_md(auth.uid())
  OR manages_department(auth.uid(), task_department(task_id))
  OR is_task_assignee(auth.uid(), task_id)
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
);

CREATE POLICY "Upload task attachments"
ON public.task_attachments FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid()
  AND (
    is_admin_or_md(auth.uid())
    OR manages_department(auth.uid(), task_department(task_id))
    OR is_task_assignee(auth.uid(), task_id)
    OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
  )
);

CREATE POLICY "Delete own task attachments"
ON public.task_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR is_admin_or_md(auth.uid()));