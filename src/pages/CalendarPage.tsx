import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks, TaskRow } from "@/hooks/useTasks";
import { todayIST, formatDateIST } from "@/lib/time";

const priorityColors: Record<string, string> = {
  critical: "hsl(0,72%,51%)", high: "hsl(38,92%,50%)", medium: "hsl(239,84%,67%)", low: "hsl(142,71%,45%)",
};

const CalendarPage = () => {
  const { tasks, loading } = useTasks();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayIST();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = i - firstDay + 1;
    if (d < 1 || d > daysInMonth) return null;
    return d;
  });

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prev}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm font-medium text-foreground min-w-[140px] text-center">
            {formatDateIST(currentDate, { month: "long", year: "numeric" })}
          </span>
          <Button variant="ghost" size="icon" onClick={next}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="grid grid-cols-7">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="text-xs font-medium text-muted-foreground text-center py-2 border-b">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              if (day === null) return <div key={i} className="min-h-[100px] border-b border-r bg-muted/30" />;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const dayTasks = tasks.filter(t => t.due_date === dateStr);
              const isToday = dateStr === today;
              return (
                <div key={i} className="min-h-[100px] border-b border-r p-1 hover:bg-muted/30 transition-colors">
                  <span className={`text-xs inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground font-bold" : "text-foreground"}`}>
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-primary-foreground"
                        style={{ backgroundColor: priorityColors[t.priority] || priorityColors.medium }}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTasks.length > 3 && <p className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarPage;
