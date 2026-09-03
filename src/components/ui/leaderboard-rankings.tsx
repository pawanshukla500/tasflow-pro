import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn, getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface LeaderboardRankingItem {
  userId: string;
  rank: number;
  userName: string;
  byline?: string;
  value: number;
  /** Set to false to hide the row (e.g. filtered out by scope). */
  displayed?: boolean;
  avatarUrl?: string | null;
}

interface LeaderboardRankingsProps extends React.HTMLAttributes<HTMLDivElement> {
  rankings: LeaderboardRankingItem[];
  currentUserId?: string;
  showPagination?: boolean;
  defaultPageSize?: number;
  formatValue?: (value: number) => string;
  valueLabel?: string;
  emptyMessage?: string;
}

const LeaderboardRankings = React.forwardRef<HTMLDivElement, LeaderboardRankingsProps>(
  (
    {
      className,
      rankings,
      currentUserId,
      showPagination = false,
      defaultPageSize = 10,
      formatValue,
      valueLabel,
      emptyMessage = "No ranked members yet.",
      ...props
    },
    ref,
  ) => {
    const visible = React.useMemo(
      () => rankings.filter((r) => r.displayed !== false),
      [rankings],
    );

    const pageSize = showPagination ? Math.max(1, defaultPageSize) : visible.length || 1;
    const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
    const [page, setPage] = React.useState(0);

    React.useEffect(() => {
      setPage((p) => Math.min(p, pageCount - 1));
    }, [pageCount]);

    const start = page * pageSize;
    const pageItems = showPagination ? visible.slice(start, start + pageSize) : visible;

    const currentUserEntry = currentUserId
      ? visible.find((r) => r.userId === currentUserId)
      : undefined;
    const currentUserOnPage = currentUserEntry
      ? pageItems.some((r) => r.userId === currentUserEntry.userId)
      : true;

    const format = formatValue ?? ((value: number) => value.toLocaleString());

    if (visible.length === 0) {
      return (
        <div ref={ref} className={cn("py-6 text-center", className)} {...props}>
          <p className="text-muted-foreground text-sm">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div ref={ref} className={cn("space-y-1", className)} {...props}>
        {pageItems.map((item) => (
          <Row
            key={item.userId}
            item={item}
            isCurrentUser={item.userId === currentUserId}
            format={format}
            valueLabel={valueLabel}
          />
        ))}

        {currentUserEntry && !currentUserOnPage ? (
          <div className="pt-2">
            <p className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wide">Your position</p>
            <Row item={currentUserEntry} isCurrentUser format={format} valueLabel={valueLabel} />
          </div>
        ) : null}

        {showPagination && pageCount > 1 ? (
          <div className="flex items-center justify-between pt-3">
            <p className="text-muted-foreground text-xs">
              {start + 1}–{Math.min(start + pageSize, visible.length)} of {visible.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="font-mono-num text-xs tabular-nums">
                {page + 1}/{pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="Next page"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

LeaderboardRankings.displayName = "LeaderboardRankings";

function Row({
  item,
  isCurrentUser,
  format,
  valueLabel,
}: {
  item: LeaderboardRankingItem;
  isCurrentUser: boolean;
  format: (value: number) => string;
  valueLabel?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors",
        "hover:bg-muted/50",
        isCurrentUser && "border-primary/30 bg-primary/5 hover:bg-primary/10",
      )}
    >
      <span
        className={cn(
          "font-mono-num text-muted-foreground w-6 shrink-0 text-center text-xs font-semibold",
          item.rank <= 3 && "text-foreground",
        )}
      >
        {item.rank}
      </span>

      <Avatar className="h-8 w-8 shrink-0">
        {item.avatarUrl ? <AvatarImage src={item.avatarUrl} alt={item.userName} /> : null}
        <AvatarFallback className="text-[10px] font-semibold">{getInitials(item.userName)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.userName}
          {isCurrentUser ? <span className="text-primary ml-1.5 text-[10px] font-semibold">You</span> : null}
        </p>
        {item.byline ? (
          <p className="text-muted-foreground truncate text-[11px]">{item.byline}</p>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p className="font-mono-num text-sm font-semibold">{format(item.value)}</p>
        {valueLabel ? <p className="text-muted-foreground text-[10px]">{valueLabel}</p> : null}
      </div>
    </div>
  );
}

export { LeaderboardRankings };
export type { LeaderboardRankingItem, LeaderboardRankingsProps };
