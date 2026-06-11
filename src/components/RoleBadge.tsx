import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleDisplayName } from "@/lib/accessControl";
import type { AppRole } from "@/contexts/AuthContext";

const roleStyles: Record<string, string> = {
  managing_director: "bg-primary/15 text-primary border-primary/25",
  system_admin: "bg-destructive/10 text-destructive border-destructive/25",
  department_manager: "bg-violet-500/10 text-violet-600 dark:text-violet-300 border-violet-500/25",
  hr: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  employee: "bg-muted text-muted-foreground border-border",
};

interface RoleBadgeProps {
  role: AppRole | string;
  className?: string;
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold capitalize border",
        roleStyles[role] || roleStyles.employee,
        className,
      )}
    >
      {roleDisplayName(role)}
    </Badge>
  );
}
