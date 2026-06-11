-- Re-assert organization RLS policies.
-- The remote DB was bootstrapped from a consolidated migration whose policy set
-- drifted from 20260610200000 (the INSERT policy on organizations was missing,
-- so client-side org registration was silently rejected). Idempotent re-create.

DROP POLICY IF EXISTS "Members view own organization" ON public.organizations;
CREATE POLICY "Members view own organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (id = public.user_organization_id(auth.uid()) OR public.is_admin_or_md(auth.uid()));

DROP POLICY IF EXISTS "Org admins update organization" ON public.organizations;
CREATE POLICY "Org admins update organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), id) OR public.is_admin_or_md(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), id) OR public.is_admin_or_md(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can create organization" ON public.organizations;
CREATE POLICY "Authenticated can create organization"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "View org members in same org" ON public.organization_members;
CREATE POLICY "View org members in same org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id(auth.uid())
    OR public.is_admin_or_md(auth.uid())
  );

DROP POLICY IF EXISTS "Org admins manage members" ON public.organization_members;
CREATE POLICY "Org admins manage members"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()));

DROP POLICY IF EXISTS "Org admins view audit logs" ON public.audit_logs;
CREATE POLICY "Org admins view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    organization_id = public.user_organization_id(auth.uid())
    AND (public.is_org_admin(auth.uid(), organization_id) OR public.is_admin_or_md(auth.uid()))
  );

DROP POLICY IF EXISTS "Service role inserts audit logs" ON public.audit_logs;
CREATE POLICY "Service role inserts audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role' OR public.is_admin_or_md(auth.uid()));
