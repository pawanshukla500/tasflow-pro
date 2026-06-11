import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center animate-in fade-in duration-300", className)}>
      <div className="w-14 h-14 rounded-2xl bg-muted/80 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
      )}
      {action && (
        <Button className="mt-4" size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}
