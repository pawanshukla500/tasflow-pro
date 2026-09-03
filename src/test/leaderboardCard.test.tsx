import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { LeaderboardCard } from "@/components/ui/leaderboard-card";

const rankings = Array.from({ length: 12 }, (_, i) => ({
  userId: `u-${i + 1}`,
  rank: i + 1,
  userName: `Member ${i + 1}`,
  byline: `${12 - i} completed`,
  value: 100 - i,
}));

function renderCard(currentUserId?: string) {
  return render(
    <LeaderboardCard
      title="Team leaderboard"
      fromDate="2026-05-04"
      toDate="2026-05-07"
      currentUserId={currentUserId}
      valueLabel="score"
      podiumRankings={rankings.slice(0, 3)}
      rankings={rankings}
    />,
  );
}

describe("LeaderboardCard", () => {
  it("renders the IST date range and the first page of rankings", () => {
    renderCard();

    expect(screen.getByText("Team leaderboard")).toBeInTheDocument();
    expect(screen.getByText(/4 May 2026 – 7 May 2026/)).toBeInTheDocument();
    expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
    expect(screen.queryByText("Member 11")).not.toBeInTheDocument();
  });

  it("paginates to the remaining members", () => {
    renderCard();

    fireEvent.click(screen.getByLabelText("Next page"));

    expect(screen.getByText("11–12 of 12")).toBeInTheDocument();
    expect(screen.getByText("Member 11")).toBeInTheDocument();
  });

  it("pins the signed-in member when they are off the current page", () => {
    renderCard("u-12");

    expect(screen.getByText("Your position")).toBeInTheDocument();
    expect(screen.getByText("Member 12")).toBeInTheDocument();
  });

  it("shows the podium members only once at the top", () => {
    renderCard();

    // Rank 1 appears on the podium and in the list.
    expect(screen.getAllByText("Member 1")).toHaveLength(2);
  });

  it("hides the date range when fromDate/toDate are omitted (e.g. a lifetime metric)", () => {
    render(
      <LeaderboardCard
        title="Team leaderboard"
        description="cumulative performance score"
        valueLabel="score"
        podiumRankings={rankings.slice(0, 3)}
        rankings={rankings}
      />,
    );

    expect(screen.getByText("cumulative performance score")).toBeInTheDocument();
    expect(screen.queryByText(/May 2026/)).not.toBeInTheDocument();
  });

  it("resets to page one when resetKey changes (e.g. switching periods)", () => {
    const { rerender } = render(
      <LeaderboardCard
        title="Team leaderboard"
        fromDate="2026-05-04"
        toDate="2026-05-07"
        valueLabel="score"
        podiumRankings={rankings.slice(0, 3)}
        rankings={rankings}
        resetKey="week"
      />,
    );

    fireEvent.click(screen.getByLabelText("Next page"));
    expect(screen.getByText("11–12 of 12")).toBeInTheDocument();

    rerender(
      <LeaderboardCard
        title="Team leaderboard"
        fromDate="2026-05-01"
        toDate="2026-05-07"
        valueLabel="score"
        podiumRankings={rankings.slice(0, 3)}
        rankings={rankings}
        resetKey="month"
      />,
    );

    expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
  });
});
