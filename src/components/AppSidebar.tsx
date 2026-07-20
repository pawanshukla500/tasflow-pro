import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home, CheckSquare, Inbox, LayoutGrid, Calendar, GitBranch,
  Target, Users, Building2, BarChart3, Settings, Plus, TrendingUp,
  Search, ChevronLeft, ChevronRight, LogOut, Sun, Moon, StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { RoleBadge } from "@/components/RoleBadge";
import { NotificationCenter } from "@/components/NotificationCenter";
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
    { label: "Inbox", icon: Inbox, path: "/inbox" },
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
      "h-full bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-200",
      mobile ? "w-full" : "h-screen shrink-0",
      !mobile && (isCollapsed ? "w-14" : "w-60"),
    )}>
      <div className={cn("p-3 flex items-center gap-2 border-b border-sidebar-border", isCollapsed && !mobile && "justify-center p-2")}>
        {!isCollapsed && (
          <>
            <div className="w-9 h-9 rounded-xl bg-white border flex items-center justify-center shrink-0 overflow-hidden p-1 shadow-sm">
              <img src="/youthnic-logo.png" alt="TaskFlow Pro" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-bold text-foreground truncate tracking-tight">TaskFlow Pro</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user?.organization?.name || "Enterprise Workspace"}
              </p>
            </div>
          </>
        )}
        {!mobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
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
            className="w-full justify-start gap-2 press-scale group/new bg-gradient-to-r from-primary to-primary/85 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30"
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
          className={cn("w-full justify-start gap-2 text-muted-foreground hover:text-foreground", isCollapsed && "justify-center")}
          size="sm"
          onClick={onSearch}
        >
          <Search className="h-4 w-4" />
          {!isCollapsed && (
            <>
              <span className="flex-1 text-left text-xs">Search tasks</span>
              <kbd className="hidden lg:inline text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
            </>
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {navItems.map((group, gi) => (
          <div key={gi}>
            {group.group && !isCollapsed && (
              <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest px-2.5 mb-1.5">{group.group}</p>
            )}
            <div className="space-y-0.5 stagger-children">
              {group.items.filter((item) => {
                if (item.adminOnly) return accessScope.hasFullAccess;
                if (item.managerUp) return isManagerUp;
                return true;
              }).map((item) => {
                const active = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={cn(
                      "relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all press-scale group/nav",
                      active
                        ? "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground font-medium shadow-md shadow-primary/20 animate-pop"
                        : "text-sidebar-foreground hover:bg-muted/80 hover:translate-x-0.5",
                      isCollapsed && "justify-center px-2",
                    )}
                  >
                    {active && !isCollapsed && (
                      <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-primary animate-pop" aria-hidden />
                    )}
                    <item.icon className={cn(
                      "h-4 w-4 shrink-0 transition-transform group-hover/nav:scale-110",
                      active && "text-primary-foreground",
                    )} />
                    {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-2 pb-2">
        <NotificationCenter collapsed={isCollapsed && !mobile} />
      </div>

      <div className="p-2 border-t border-sidebar-border">
        <div className={cn(
          "flex items-center gap-2 p-2 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors border border-transparent hover:border-border",
          isCollapsed && !mobile && "justify-center p-1.5",
        )}>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden ring-2 ring-background shadow-sm">
            {user?.profile?.avatar_url ? (
              <img src={user.profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              user?.profile?.name ? getInitials(user.profile.name) : "?"
            )}
          </div>
          {!isCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{user?.profile?.name || "User"}</p>
                {user?.roles[0] ? (
                  <RoleBadge role={user.roles[0]} className="mt-0.5" />
                ) : (
                  <p className="text-[10px] text-muted-foreground truncate">Team Member</p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleTheme} aria-label="Toggle theme">
                  {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={handleSignOut} aria-label="Sign out">
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
