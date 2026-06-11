import { Eye, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessScope } from "@/lib/accessControl";
import { scopeDescription } from "@/lib/accessControl";

interface ScopeBannerProps {
  scope: AccessScope;
  departmentNames?: string[];
  className?: string;
}

export function ScopeBanner({ scope, departmentNames = [], className }: ScopeBannerProps) {
  if (scope.tier === "member") return null;

  const Icon = scope.hasFullAccess ? Shield : scope.isHR ? Users : Eye;
  const label = scopeDescription(scope, departmentNames);

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs animate-fade-in",
        scope.hasFullAccess
          ? "bg-primary/5 border-primary/20 text-primary"
          : "bg-muted/50 border-border text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold text-foreground">{scope.hasFullAccess ? "Full access" : "Scoped view"}</span>
        <span className="mx-1.5 text-muted-foreground/60">·</span>
        {label}
      </span>
    </div>
  );
}
