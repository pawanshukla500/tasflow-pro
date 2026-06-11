-- 1) Custom fields per template + values per workflow
CREATE TABLE public.workflow_template_fields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text|number|date
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.workflow_template_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View template fields" ON public.workflow_template_fields
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage template fields" ON public.workflow_template_fields
  FOR ALL TO authenticated
  USING (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM department_managers WHERE user_id = auth.uid()))
  WITH CHECK (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM department_managers WHERE user_id = auth.uid()));

CREATE TABLE public.workflow_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workflow_id UUID NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, field_key)
);
ALTER TABLE public.workflow_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View workflow field values" ON public.workflow_field_values
  FOR SELECT TO authenticated
  USING (is_admin_or_md(auth.uid()) OR user_in_workflow(auth.uid(), workflow_id) OR EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));
CREATE POLICY "Insert workflow field values" ON public.workflow_field_values
  FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));
CREATE POLICY "Update workflow field values" ON public.workflow_field_values
  FOR UPDATE TO authenticated
  USING (is_admin_or_md(auth.uid()) OR EXISTS (SELECT 1 FROM workflows w WHERE w.id = workflow_id AND w.raised_by = auth.uid()));
CREATE POLICY "Delete workflow field values" ON public.workflow_field_values
  FOR DELETE TO authenticated
  USING (is_admin_or_md(auth.uid()));

CREATE INDEX idx_template_fields_template ON public.workflow_template_fields(template_id, position);
CREATE INDEX idx_field_values_workflow ON public.workflow_field_values(workflow_id);

-- 2) Chat: conversations, participants, messages
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_group BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.conversation_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- helper function to avoid recursion
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_user_id uuid, _conv_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversation_participants WHERE conversation_id = _conv_id AND user_id = _user_id)
$$;

CREATE POLICY "View own conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (is_conversation_participant(auth.uid(), id));
CREATE POLICY "Create conversations" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "Update own conversations" ON public.conversations
  FOR UPDATE TO authenticated USING (is_conversation_participant(auth.uid(), id));

CREATE POLICY "View participants of own convos" ON public.conversation_participants
  FOR SELECT TO authenticated
  USING (is_conversation_participant(auth.uid(), conversation_id));
CREATE POLICY "Add participants" ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    OR is_conversation_participant(auth.uid(), conversation_id)
  );
CREATE POLICY "Update own participant row" ON public.conversation_participants
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Leave conversation" ON public.conversation_participants
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "View messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (is_conversation_participant(auth.uid(), conversation_id));
CREATE POLICY "Send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND is_conversation_participant(auth.uid(), conversation_id));
CREATE POLICY "Delete own messages" ON public.chat_messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

CREATE INDEX idx_chat_messages_conv ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX idx_conv_participants_user ON public.conversation_participants(user_id);

-- bump conversation last_message_at on new message
CREATE OR REPLACE FUNCTION public.bump_conversation_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bump_conversation
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;

-- 3) Allow admin/MD to delete active workflows (policy already allows admin delete; just ensure cascade cleanup)
-- Add explicit cleanup function so app can call one RPC
CREATE OR REPLACE FUNCTION public.delete_workflow_cascade(_workflow_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_md(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins or MDs can delete workflows';
  END IF;
  DELETE FROM public.workflow_stage_comments WHERE workflow_id = _workflow_id;
  DELETE FROM public.workflow_stage_events WHERE workflow_id = _workflow_id;
  DELETE FROM public.workflow_field_values WHERE workflow_id = _workflow_id;
  DELETE FROM public.workflow_stages WHERE workflow_id = _workflow_id;
  DELETE FROM public.workflows WHERE id = _workflow_id;
END;
$$;