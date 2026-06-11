-- Re-attach handle_new_user trigger to auth.users (it was missing)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Re-attach notification preferences trigger
DROP TRIGGER IF EXISTS on_auth_user_created_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_prefs();

-- Re-attach updated_at triggers on key tables
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_tasks_updated_at ON public.tasks;
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_departments_updated_at ON public.departments;
CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_workflows_updated_at ON public.workflows;
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Re-attach recurring task trigger
DROP TRIGGER IF EXISTS create_next_recurring_task_trigger ON public.tasks;
CREATE TRIGGER create_next_recurring_task_trigger
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.create_next_recurring_task();

-- Re-attach conversation bump trigger
DROP TRIGGER IF EXISTS bump_conversation_on_message_trigger ON public.chat_messages;
CREATE TRIGGER bump_conversation_on_message_trigger
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_conversation_on_message();