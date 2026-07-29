import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/motion";

type Tone = "default" | "primary" | "success" | "warning" | "danger";

const toneMap: Record<Tone, { card: string; value: string; icon: string }> = {
  default: {
    card: "bg-muted/40 ring-1 ring-border/80",
    value: "text-foreground",
    icon: "text-muted-foreground bg-muted",
  },
  primary: {
    card: "bg-primary/[0.06] ring-1 ring-primary/15",
    value: "text-primary",
    icon: "text-primary bg-primary/10",
  },
  success: {
    card: "bg-success/[0.07] ring-1 ring-success/20",
    value: "text-success",
    icon: "text-success bg-success/10",
  },
  warning: {
    card: "bg-warning/[0.08] ring-1 ring-warning/25",
    value: "text-warning",
    icon: "text-warning bg-warning/10",
  },
  danger: {
    card: "bg-destructive/[0.06] ring-1 ring-destructive/20",
    value: "text-destructive",
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
}

export function HomeKpiCard({
  label,
  value,
  caption,
  icon: Icon,
  tone = "default",
  trendSlot,
  className,
}: HomeKpiCardProps) {
  const t = toneMap[tone];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl p-3.5 sm:p-4 transition-shadow duration-200 hover:shadow-sm",
        t.card,
        className,
      )}
    >
      <span className="pointer-events-none absolute -right-5 -top-5 h-14 w-14 rounded-full bg-foreground/[0.03]" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", t.icon)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        {trendSlot}
      </div>
      <p className={cn("text-stat text-2xl sm:text-3xl mt-3 leading-none", t.value)}>
        <CountUp value={value} />
      </p>
      <p className="text-xs font-medium text-foreground/80 mt-2">{label}</p>
      {caption ? <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{caption}</p> : null}
    </div>
  );
}
