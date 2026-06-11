-- Multi-tenant organizations + Firebase Auth linkage + audit logs
-- Fresh SaaS foundation (no demo/seed data)

CREATE TYPE public.domain_type AS ENUM ('custom', 'public');

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT,
  domain_type public.domain_type NOT NULL DEFAULT 'custom',
  allow_public_email BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link profiles to Firebase + organization
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_profiles_firebase_uid ON public.profiles(firebase_uid);

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Audit trail for admin panel
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id, created_at DESC);

-- Organization membership (explicit join for role at org level)
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_org_admin BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- Helpers
CREATE OR REPLACE FUNCTION public.user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND is_org_admin = true
  ) OR public.is_admin_or_md(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.extract_email_domain(_email TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(split_part(_email, '@', 2));
$$;

-- Replace bootstrap trigger: no hardcoded admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, firebase_uid)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'firebase_uid'
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    firebase_uid = COALESCE(EXCLUDED.firebase_uid, public.profiles.firebase_uid);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;

  RETURN NEW;
END;
$$;

-- RLS: organizations
CREATE POLICY "Members view own organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.user_organization_id(auth.uid()) OR public.is_admin_or_md(auth.uid()));

CREATE POLICY "Org admins update organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), id) OR public.is_admin_or_md(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), id) OR public.is_admin_or_md(auth.uid()));

CREATE POLICY "Authenticated can create organization"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- RLS: organization_members
CREATE POLICY "View org members in same org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id(auth.uid())
    OR public.is_admin_or_md(auth.uid())
  );

CREATE POLICY "Org admins manage members"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()));

-- RLS: audit_logs (read-only for org admins)
CREATE POLICY "Org admins view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id(auth.uid())
    AND (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()))
  );

CREATE POLICY "Service role inserts audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role' OR public.is_admin_or_md(auth.uid()));

-- Scope departments/tasks to organization
DROP POLICY IF EXISTS "Anyone can view departments" ON public.departments;
CREATE POLICY "View departments in org"
  ON public.departments FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR organization_id = public.user_organization_id(auth.uid())
    OR public.is_admin_or_md(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins manage departments in org"
  ON public.departments FOR ALL TO authenticated
  USING (
    public.is_admin_or_md(auth.uid())
    OR (organization_id = public.user_organization_id(auth.uid()) AND public.is_org_admin(auth.uid(), organization_id))
  )
  WITH CHECK (
    public.is_admin_or_md(auth.uid())
    OR (organization_id = public.user_organization_id(auth.uid()) AND public.is_org_admin(auth.uid(), organization_id))
  );

DROP POLICY IF EXISTS "Users can view relevant tasks" ON public.tasks;
CREATE POLICY "Users view tasks in org"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    (organization_id IS NULL OR organization_id = public.user_organization_id(auth.uid()))
    AND (
      public.is_admin_or_md(auth.uid())
      OR public.manages_department(auth.uid(), department_id)
      OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = id AND user_id = auth.uid())
      OR created_by = auth.uid()
    )
  );
