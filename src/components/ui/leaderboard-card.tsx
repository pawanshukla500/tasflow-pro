import * as React from "react";

import { cn } from "@/lib/utils";
import { formatDateIST } from "@/lib/time";
import {
  LeaderboardPodium,
  type LeaderboardRanking as LeaderboardPodiumRanking,
} from "@/components/ui/leaderboard-podium";
import {
  LeaderboardRankings,
  type LeaderboardRankingItem,
} from "@/components/ui/leaderboard-rankings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface LeaderboardRunOption {
  id: string;
  label: string;
}

interface LeaderboardCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  fromDate: string | Date;
  toDate: string | Date;
  podiumRankings: LeaderboardPodiumRanking[];
  rankings: LeaderboardRankingItem[];
  currentUserId?: string;
  runOptions?: LeaderboardRunOption[];
  selectedRunId?: string;
  onRunChange?: (runId: string) => void;
  /** Formats the numeric value on the podium and in the list. */
  formatValue?: (value: number) => string;
  /** Short unit rendered next to values (e.g. "pts", "tasks"). */
  valueLabel?: string;
  loading?: boolean;
  emptyMessage?: string;
  footer?: React.ReactNode;
}

function formatRangeDate(date: string | Date) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";

  return formatDateIST(date, { month: "short", day: "numeric", year: "numeric" });
}

const LeaderboardCard = React.forwardRef<HTMLDivElement, LeaderboardCardProps>(
  (
    {
      className,
      title = "Leaderboard",
      description,
      fromDate,
      toDate,
      podiumRankings,
      rankings,
      currentUserId,
      runOptions,
      selectedRunId,
      onRunChange,
      formatValue,
      valueLabel,
      loading = false,
      emptyMessage,
      footer,
      ...props
    },
    ref,
  ) => {
    const fromLabel = formatRangeDate(fromDate);
    const toLabel = formatRangeDate(toDate);
    const resolvedRunId = selectedRunId ?? runOptions?.[0]?.id ?? "";
    const hasOnRunChange = Boolean(onRunChange);
    const [localRunId, setLocalRunId] = React.useState(resolvedRunId);

    React.useEffect(() => {
      if (hasOnRunChange) return;
      setLocalRunId(resolvedRunId);
    }, [hasOnRunChange, resolvedRunId]);

    const activeRunId = hasOnRunChange ? resolvedRunId : localRunId;

    return (
      <div
        ref={ref}
        className={cn("bg-card rounded-2xl border p-6 shadow-sm", className)}
        {...props}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">{title}</h3>
            <p className="text-muted-foreground text-sm">
              {fromLabel} – {toLabel}
              {description ? ` · ${description}` : ""}
            </p>
          </div>

          {runOptions && runOptions.length > 0 ? (
            <Select
              value={activeRunId}
              onValueChange={(value) => {
                if (onRunChange) {
                  onRunChange(value);
                  return;
                }
                setLocalRunId(value);
              }}
            >
              <SelectTrigger className="h-9 w-40 text-sm" aria-label="Select leaderboard period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {runOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {loading ? (
          <p className="text-muted-foreground py-8 text-center text-sm">Loading leaderboard…</p>
        ) : (
          <>
            <LeaderboardPodium
              rankings={podiumRankings}
              currentUserId={currentUserId}
              formatValue={formatValue}
              valueLabel={valueLabel}
              className="mb-6"
            />

            <LeaderboardRankings
              rankings={rankings}
              currentUserId={currentUserId}
              formatValue={formatValue}
              valueLabel={valueLabel}
              emptyMessage={emptyMessage}
              showPagination
              defaultPageSize={10}
            />
          </>
        )}

        {footer ? <div className="mt-4 border-t pt-3">{footer}</div> : null}
      </div>
    );
  },
);

LeaderboardCard.displayName = "LeaderboardCard";

export { LeaderboardCard };
export type { LeaderboardCardProps, LeaderboardRunOption };
