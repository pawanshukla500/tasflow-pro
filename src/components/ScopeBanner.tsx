import { Eye, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AccessScope } from "@/lib/accessControl";
import { scopeDescription } from "@/lib/accessControl";

interface ScopeBannerProps {
  scope: AccessScope;
  departmentNames?: string[];
  className?: string;
}

/**
 * Compact scope chip for managers / HR.
 * Hidden for members and for org-wide admins (full access is implied by role —
 * the old "Full access · Organization-wide view — full access" banner was redundant).
 * Presentation only — does not affect permissions or data filtering.
 */
export function ScopeBanner({ scope, departmentNames = [], className }: ScopeBannerProps) {
  if (scope.tier === "member" || scope.hasFullAccess) return null;

  const Icon = scope.isHR ? Users : Eye;
  const label = scopeDescription(scope, departmentNames);

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground animate-fade-in",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-3 w-3 shrink-0 text-foreground/70" aria-hidden />
      <span className="truncate">
        <span className="font-semibold text-foreground">Scoped</span>
        <span className="mx-1 text-muted-foreground/50">·</span>
        {label}
      </span>
    </div>
  );
}
