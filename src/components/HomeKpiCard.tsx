import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion";

type Tone = "default" | "primary" | "success" | "warning" | "danger";

const toneMap: Record<Tone, { accent: string; value: string; icon: string }> = {
  default: {
    accent: "bg-foreground/20",
    value: "text-foreground",
    icon: "text-muted-foreground bg-muted",
  },
  primary: {
    accent: "bg-primary",
    value: "text-foreground",
    icon: "text-primary bg-primary/10",
  },
  success: {
    accent: "bg-success",
    value: "text-foreground",
    icon: "text-success bg-success/10",
  },
  warning: {
    accent: "bg-warning",
    value: "text-foreground",
    icon: "text-warning bg-warning/10",
  },
  danger: {
    accent: "bg-destructive",
    value: "text-foreground",
    icon: "text-destructive bg-destructive/10",
  },
};

export interface HomeKpiCardProps {
  label: string;
  value: number;
  caption?: string;
  icon: LucideIcon;
  tone?: Tone;
  trendSlot?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function HomeKpiCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "default",
  trendSlot,
  className,
  onClick,
}: HomeKpiCardProps) {
  const t = toneMap[tone];
  const classNameAll = cn(
    "relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 text-left shadow-sm transition-shadow duration-200",
    onClick && "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    className,
  );
  const body = (
    <>
      <span className={cn("absolute inset-y-0 left-0 w-1", t.accent)} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", t.icon)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        {trendSlot}
      </div>
      <p className={cn("text-stat text-2xl sm:text-3xl mt-3 leading-none pl-2", t.value)}>
        <CountUp value={value} />
      </p>
      <p className="text-xs font-medium text-foreground/80 mt-2 pl-2">{label}</p>
      {caption ? <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug pl-2">{caption}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classNameAll}>
        {body}
      </button>
    );
  }
  return <div className={classNameAll}>{body}</div>;
}
