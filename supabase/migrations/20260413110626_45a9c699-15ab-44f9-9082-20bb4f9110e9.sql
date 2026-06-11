-- Create role enum
CREATE TYPE public.app_role AS ENUM ('managing_director', 'system_admin', 'department_manager', 'employee');

-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  mobile_no TEXT,
  position TEXT,
  department_id UUID REFERENCES public.departments(id),
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  performance_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- User roles table (separate from profiles per security best practice)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Department managers junction (a user can manage multiple departments)
CREATE TABLE public.department_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (user_id, department_id)
);

ALTER TABLE public.department_managers ENABLE ROW LEVEL SECURITY;

-- Tasks table
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'blocked')),
  due_date DATE,
  start_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Task assignees junction
CREATE TABLE public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (task_id, user_id)
);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is MD or System Admin
CREATE OR REPLACE FUNCTION public.is_admin_or_md(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('managing_director', 'system_admin')
  )
$$;

-- Check if user manages a specific department
CREATE OR REPLACE FUNCTION public.manages_department(_user_id UUID, _dept_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.department_managers
    WHERE user_id = _user_id AND department_id = _dept_id
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  
  -- Auto-assign system_admin role for returnorders@vbexports.co.in
  IF NEW.email = 'returnorders@vbexports.co.in' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'system_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS Policies

-- Departments: everyone can read, only admins/MD can modify
CREATE POLICY "Anyone can view departments" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage departments" ON public.departments FOR ALL TO authenticated USING (public.is_admin_or_md(auth.uid()));

-- Profiles: everyone can read, users can update own, admins can update all
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin_or_md(auth.uid()));

-- User roles: everyone can read, only admins can modify
CREATE POLICY "Anyone can view roles" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin_or_md(auth.uid()));

-- Department managers: everyone can read, admins can modify
CREATE POLICY "Anyone can view department managers" ON public.department_managers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage department managers" ON public.department_managers FOR ALL TO authenticated USING (public.is_admin_or_md(auth.uid()));

-- Tasks: visible based on role
CREATE POLICY "Users can view relevant tasks" ON public.tasks FOR SELECT TO authenticated USING (
  public.is_admin_or_md(auth.uid())
  OR public.manages_department(auth.uid(), department_id)
  OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = id AND user_id = auth.uid())
  OR created_by = auth.uid()
);
CREATE POLICY "Admins and managers can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (
  public.is_admin_or_md(auth.uid())
  OR public.manages_department(auth.uid(), department_id)
);
CREATE POLICY "Admins and managers can update tasks" ON public.tasks FOR UPDATE TO authenticated USING (
  public.is_admin_or_md(auth.uid())
  OR public.manages_department(auth.uid(), department_id)
  OR EXISTS (SELECT 1 FROM public.task_assignees WHERE task_id = id AND user_id = auth.uid())
);
CREATE POLICY "Admins can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (
  public.is_admin_or_md(auth.uid())
  OR public.manages_department(auth.uid(), department_id)
);

-- Task assignees
CREATE POLICY "Anyone can view task assignees" ON public.task_assignees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and managers can manage assignees" ON public.task_assignees FOR ALL TO authenticated USING (
  public.is_admin_or_md(auth.uid())
  OR EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND public.manages_department(auth.uid(), t.department_id))
);