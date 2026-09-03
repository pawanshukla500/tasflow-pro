/**
 * DEV-only preview of the Performance leaderboard card (no real auth required).
 * Visit http://localhost:8080/__dev__/leaderboard while `npm run dev` is running.
 */
import { LeaderboardCard } from "@/components/ui/leaderboard-card";

const rankings = [
  { userId: "u-1", rank: 1, userName: "Ava Elizabeth Turner", byline: "18 completed · 94% on-time", value: 94 },
  { userId: "u-2", rank: 2, userName: "Leo Harrison", byline: "16 completed · 88% on-time", value: 88 },
  { userId: "u-3", rank: 3, userName: "Rowan Elijah", byline: "14 completed · 85% on-time", value: 85 },
  { userId: "u-4", rank: 4, userName: "Maya Chen", byline: "12 completed · 80% on-time · 2 late", value: 79 },
  { userId: "u-5", rank: 5, userName: "Kabir Rao", byline: "9 completed · 72% on-time", value: 71 },
  { userId: "u-6", rank: 6, userName: "Diya Sharma", byline: "8 completed · 70% on-time", value: 68 },
  { userId: "u-7", rank: 7, userName: "Arjun Mehta", byline: "6 completed · 66% on-time", value: 61 },
  { userId: "u-8", rank: 8, userName: "Sara Iqbal", byline: "5 completed · 60% on-time", value: 55 },
  { userId: "u-9", rank: 9, userName: "Nikhil Verma", byline: "4 completed · 55% on-time", value: 49 },
  { userId: "u-10", rank: 10, userName: "Ishita Bose", byline: "3 completed · 50% on-time", value: 42 },
  { userId: "u-11", rank: 11, userName: "You", byline: "2 completed · 50% on-time · 1 late", value: 38 },
];

const DevLeaderboardPreview = () => (
  <div className="bg-background min-h-screen p-8">
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Performance leaderboard preview</h1>
        <p className="text-muted-foreground text-sm">
          Layout-only DEV preview with sample data — the real card is on the Performance tab.
        </p>
      </div>
      <LeaderboardCard
        title="Team leaderboard"
        description="Organization-wide · tasks completed this week"
        fromDate="2026-05-04"
        toDate="2026-05-07"
        currentUserId="u-11"
        valueLabel="score"
        podiumRankings={rankings.slice(0, 3)}
        rankings={rankings}
        runOptions={[
          { id: "week", label: "This week" },
          { id: "month", label: "This month" },
          { id: "all", label: "All time" },
        ]}
      />
    </div>
  </div>
);

export default DevLeaderboardPreview;
