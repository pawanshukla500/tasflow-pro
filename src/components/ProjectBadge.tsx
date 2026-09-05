import { cn } from "@/lib/utils";

interface ProjectBadgeProps {
  name: string;
  color?: string | null;
  icon?: string | null;
  className?: string;
}

export function ProjectBadge({ name, color, icon, className }: ProjectBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 max-w-[140px] truncate text-[10px] font-medium h-5 px-1.5 rounded-md border bg-background",
        className,
      )}
      title={name}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color || "#0D9488" }}
        aria-hidden
      />
      {icon ? <span className="leading-none" aria-hidden>{icon}</span> : null}
      <span className="truncate">{name}</span>
    </span>
  );
}
