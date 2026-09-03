import * as React from "react";
import { Crown, Medal } from "lucide-react";

import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LeaderboardRanking {
  userId: string;
  userName: string;
  rank: number;
  value: number;
  avatarUrl?: string | null;
  byline?: string;
}

interface LeaderboardPodiumProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRanking[];
  /** Formats the numeric value shown under each name. */
  formatValue?: (value: number) => string;
  /** Short unit rendered next to the value (e.g. "pts", "tasks"). */
  valueLabel?: string;
  currentUserId?: string;
}

const podiumStyle: Record<
  number,
  { pedestal: string; ring: string; badge: string; avatar: string; height: string }
> = {
  1: {
    pedestal: "bg-gradient-to-b from-amber-300/70 to-amber-500/30 dark:from-amber-400/40 dark:to-amber-600/20",
    ring: "ring-2 ring-amber-400",
    badge: "bg-amber-400 text-amber-950",
    avatar: "h-16 w-16",
    height: "h-24",
  },
  2: {
    pedestal: "bg-gradient-to-b from-slate-300/70 to-slate-400/30 dark:from-slate-400/40 dark:to-slate-500/20",
    ring: "ring-2 ring-slate-400",
    badge: "bg-slate-400 text-slate-950",
    avatar: "h-12 w-12",
    height: "h-16",
  },
  3: {
    pedestal: "bg-gradient-to-b from-orange-300/70 to-orange-500/30 dark:from-orange-400/40 dark:to-orange-600/20",
    ring: "ring-2 ring-orange-400",
    badge: "bg-orange-400 text-orange-950",
    avatar: "h-12 w-12",
    height: "h-12",
  },
};

const LeaderboardPodium = React.forwardRef<HTMLDivElement, LeaderboardPodiumProps>(
  ({ className, rankings, formatValue, valueLabel, currentUserId, ...props }, ref) => {
    const byRank = new Map(rankings.map((r) => [r.rank, r]));
    // Classic podium order: silver, gold, bronze.
    const columns = [2, 1, 3].map((rank) => byRank.get(rank)).filter(Boolean) as LeaderboardRanking[];

    if (columns.length === 0) return null;

    const format = formatValue ?? ((value: number) => value.toLocaleString());

    return (
      <div
        ref={ref}
        className={cn("flex items-end justify-center gap-3 sm:gap-6", className)}
        {...props}
      >
        {columns.map((entry) => {
          const style = podiumStyle[entry.rank] ?? podiumStyle[3];
          const isCurrentUser = Boolean(currentUserId) && entry.userId === currentUserId;

          return (
            <div key={entry.userId} className="flex w-24 flex-col items-center sm:w-32">
              <div className="relative mb-2">
                {entry.rank === 1 ? (
                  <Crown className="absolute -top-4 left-1/2 h-5 w-5 -translate-x-1/2 text-amber-500" />
                ) : null}
                <Avatar className={cn(style.avatar, style.ring)}>
                  {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt={entry.userName} /> : null}
                  <AvatarFallback className="text-sm font-semibold">
                    {getInitials(entry.userName)}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-1 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-[10px] font-bold",
                    style.badge,
                  )}
                >
                  {entry.rank}
                </span>
              </div>

              <p
                className={cn(
                  "mt-1 w-full truncate text-center text-xs font-medium sm:text-sm",
                  isCurrentUser && "text-primary",
                )}
                title={entry.userName}
              >
                {isCurrentUser ? "You" : entry.userName}
              </p>
              <p className="font-mono-num text-sm font-semibold">
                {format(entry.value)}
                {valueLabel ? (
                  <span className="text-muted-foreground ml-1 text-[10px] font-normal">{valueLabel}</span>
                ) : null}
              </p>
              {entry.byline ? (
                <p className="text-muted-foreground w-full truncate text-center text-[10px]" title={entry.byline}>
                  {entry.byline}
                </p>
              ) : null}

              <div
                className={cn(
                  "mt-2 flex w-full items-start justify-center rounded-t-lg pt-1.5",
                  style.pedestal,
                  style.height,
                )}
              >
                <Medal className="h-3.5 w-3.5 opacity-60" />
              </div>
            </div>
          );
        })}
      </div>
    );
  },
);

LeaderboardPodium.displayName = "LeaderboardPodium";

export { LeaderboardPodium };
export type { LeaderboardRanking, LeaderboardPodiumProps };
