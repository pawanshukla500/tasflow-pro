-- Pin search_path on trigger helpers so they cannot be hijacked by a mutable role path.
alter function public.project_sections_assign_sort() set search_path = public, pg_temp;
alter function public.tasks_resolve_section_lookup() set search_path = public, pg_temp;
alter function public.touch_google_connection_updated_at() set search_path = public, pg_temp;
