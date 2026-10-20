import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, CheckSquare, FolderKanban, LayoutGrid, Calendar, GitBranch,
  Target, Users, Building2, BarChart3, Settings, Plus, TrendingUp,
  Search, ChevronLeft, ChevronRight, LogOut, Sun, Moon, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { RoleBadge } from "@/components/RoleBadge";
import { NotificationCenter } from "@/components/NotificationCenter";
import { BrandLogo, BrandLockup } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  icon: typeof Home;
  path: string;
  adminOnly?: boolean;
  managerUp?: boolean;
}

const navItems: { group: string | null; items: NavItem[] }[] = [
  { group: "WORKSPACE", items: [
    { label: "Home", icon: Home, path: "/" },
    { label: "My Tasks", icon: CheckSquare, path: "/my-tasks" },
    { label: "Projects", icon: FolderKanban, path: "/projects" },
    { label: "Quick Notes", icon: StickyNote, path: "/notes" },
  ]},
  { group: "OPERATIONS", items: [
    { label: "Board", icon: LayoutGrid, path: "/board" },
    { label: "Calendar", icon: Calendar, path: "/calendar" },
    { label: "Workflows", icon: GitBranch, path: "/workflows" },
    { label: "Goals", icon: Target, path: "/goals" },
    { label: "Performance", icon: TrendingUp, path: "/performance" },
  ]},
  { group: "LEADERSHIP", items: [
    { label: "Team", icon: Users, path: "/team", managerUp: true },
    { label: "Departments", icon: Building2, path: "/departments", adminOnly: true },
    { label: "Reports", icon: BarChart3, path: "/reports", managerUp: true },
  ]},
  { group: null, items: [
    { label: "Settings", icon: Settings, path: "/settings" },
  ]},
];

interface AppSidebarProps {
  onNewTask: () => void;
  onSearch: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}

const AppSidebar = ({ onNewTask, onSearch, onNavigate, mobile = false }: AppSidebarProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, accessScope, isManagerOrAbove } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
    onNavigate?.();
  };
  const { theme, toggleTheme } = useTheme();

  const isCollapsed = mobile ? false : collapsed;
  const canCreateTask = accessScope.canCreateTasks;
  const isManagerUp = isManagerOrAbove;

  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const go = (path: string) => {
    navigate(path);
    onNavigate?.();
  };

  return (
    <aside className={cn(
      "h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col transition-all duration-200",
      mobile ? "w-full" : "h-screen shrink-0",
      !mobile && (isCollapsed ? "w-16" : "w-64"),
    )}>
      <div className={cn(
        "px-3 py-4 flex items-center gap-2",
        isCollapsed && !mobile && "flex-col justify-center gap-1.5 px-2 py-3",
      )}>
        {!isCollapsed ? (
          <BrandLockup
            size="md"
            tone="onDark"
            invertedText
            className="flex-1 min-w-0"
            subtitle={user?.organization?.name || "Workspace"}
          />
        ) : (
          !mobile && <BrandLogo size="sm" tone="onDark" alt="TaskFlow Pro" />
        )}
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground cursor-pointer"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {canCreateTask && (
        <div className="p-2">
          <Button
            className="w-full justify-start gap-2 press-scale group/new bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 shadow-none"
            size={isCollapsed ? "icon" : "sm"}
            onClick={onNewTask}
          >
            <Plus className="h-4 w-4 transition-transform duration-300 group-hover/new:rotate-90" />
            {!isCollapsed && "New Task"}
          </Button>
        </div>
      )}

      <div className="px-2 mb-1">
        <Button
          variant="ghost"
          className={cn("w-full justify-start gap-2 text-sidebar-foreground/75 hover:bg-white/10 hover:text-sidebar-foreground", isCollapsed && "justify-center")}
          size="sm"
          onClick={onSearch}
        >
          <Search className="h-4 w-4" />
          {!isCollapsed && (
            <>
              <span className="flex-1 text-left text-xs">Search tasks</span>
              <kbd className="hidden lg:inline text-[10px] bg-white/10 text-sidebar-foreground/80 px-1.5 py-0.5 rounded-md font-mono">⌘K</kbd>
            </>
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {navItems.map((group, gi) => (
          <div key={gi}>
            {group.group && !isCollapsed && (
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-2.5 mb-1.5">{group.group}</p>
            )}
            <div className="space-y-0.5 stagger-children">
              {group.items.filter((item) => {
                if (item.adminOnly) return accessScope.hasFullAccess;
                if (item.managerUp) return isManagerUp;
                return true;
              }).map((item) => {
                const active =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={cn(
                      "relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors group/nav",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                        : "text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground",
                      isCollapsed && "justify-center px-2",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-2 pb-2">
        <NotificationCenter collapsed={isCollapsed && !mobile} className="text-sidebar-foreground/80 hover:bg-white/10 hover:text-sidebar-foreground" />
      </div>

      <div className="p-2 border-t border-sidebar-border">
        <div className={cn(
          "flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10",
          isCollapsed && !mobile && "justify-center p-1.5",
        )}>
          <div className="w-9 h-9 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden">
            {user?.profile?.avatar_url ? (
              <img src={user.profile.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : (
              user?.profile?.name ? getInitials(user.profile.name) : "?"
            )}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-sidebar-foreground truncate">{user?.profile?.name || "User"}</p>
                {user?.roles[0] ? (
                  <RoleBadge role={user.roles[0]} className="mt-0.5 bg-white/10 text-sidebar-foreground border-white/15" />
                ) : (
                  <p className="text-[10px] text-sidebar-foreground/60 truncate">Team Member</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground" onClick={toggleTheme} aria-label="Toggle theme">
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-sidebar-foreground/70 hover:bg-white/10 hover:text-red-300" onClick={handleSignOut} aria-label="Sign out">
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
