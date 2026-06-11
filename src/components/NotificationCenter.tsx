import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useInAppNotifications } from "@/hooks/useInAppNotifications";
import { formatDateIST } from "@/lib/time";

interface NotificationCenterProps {
  collapsed?: boolean;
}

export function NotificationCenter({ collapsed }: NotificationCenterProps) {
  const navigate = useNavigate();
  const { notifications, unreadCount, markRead, markAllRead } = useInAppNotifications();

  const handleOpen = (id: string, url: string | null) => {
    markRead(id);
    if (url) navigate(url);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className={cn(
            "relative text-muted-foreground hover:text-foreground",
            !collapsed && "w-full justify-start gap-2",
          )}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {!collapsed && <span className="text-sm">Notifications</span>}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="right">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 px-4">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpen(n.id, n.action_url)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b last:border-0 hover:bg-muted/60 transition-colors",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <p className="text-sm font-medium text-foreground leading-snug">{n.title}</p>
                {n.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                  {formatDateIST(n.created_at, {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
