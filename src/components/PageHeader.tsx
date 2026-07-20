import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6", className)}>
      <div className="space-y-1.5 min-w-0 animate-blur-in">
        <h1 className="text-page-title truncate">{title}</h1>
        {description && (
          <p className="text-page-desc max-w-2xl">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 animate-rise [animation-delay:120ms]">{actions}</div>
      )}
    </div>
  );
}
