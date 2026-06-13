import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks } from "@/hooks/useTasks";
import { todayIST, formatDateIST } from "@/lib/time";
import {
  calendarRangeForMonth,
  getGoogleConnection,
  listGoogleCalendarEvents,
  syncGoogleCalendar,
  type GoogleCalendarEvent,
} from "@/lib/googleIntegration";
import { toast } from "sonner";

const priorityColors: Record<string, string> = {
  critical: "hsl(0,72%,51%)", high: "hsl(38,92%,50%)", medium: "hsl(239,84%,67%)", low: "hsl(142,71%,45%)",
};

const CalendarPage = () => {
  const { tasks, loading } = useTasks();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayIST();

  const prev = () => setCurrentDate(new Date(year, month - 1, 1));
  const next = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const loadGoogleEvents = useCallback(async (syncFirst = false) => {
    setGoogleLoading(true);
    try {
      const connection = await getGoogleConnection();
      setGoogleConnected(Boolean(connection));
      if (!connection) {
        setGoogleEvents([]);
        return;
      }
      if (syncFirst) {
        await syncGoogleCalendar(calendarRangeForMonth(currentDate));
      }
      setGoogleEvents(await listGoogleCalendarEvents());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Google Calendar");
    } finally {
      setGoogleLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    loadGoogleEvents(true);
  }, [loadGoogleEvents]);

  const handleSyncGoogle = async () => {
    await loadGoogleEvents(true);
    toast.success("Google Calendar synced");
  };

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
          {googleConnected && (
            <Button variant="outline" size="sm" onClick={handleSyncGoogle} disabled={googleLoading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${googleLoading ? "animate-spin" : ""}`} />
              Sync
            </Button>
          )}
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
              const dayMeetings = googleEvents.filter((event) => eventDate(event) === dateStr);
              const isToday = dateStr === today;
              return (
                <div key={i} className="min-h-[100px] border-b border-r p-1 hover:bg-muted/30 transition-colors">
                  <span className={`text-xs inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-primary text-primary-foreground font-bold" : "text-foreground"}`}>
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayMeetings.slice(0, 2).map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => {
                          const url = event.hangout_link || event.html_link;
                          if (url) window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate bg-sky-100 text-sky-900 border border-sky-200 hover:bg-sky-200"
                        title={event.title}
                      >
                        <span className="inline-flex max-w-full items-center gap-1">
                          {event.hangout_link ? <Video className="h-2.5 w-2.5 shrink-0" /> : <CalendarClock className="h-2.5 w-2.5 shrink-0" />}
                          <span className="truncate">{eventTime(event)} {event.title}</span>
                        </span>
                      </button>
                    ))}
                    {dayTasks.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-primary-foreground"
                        style={{ backgroundColor: priorityColors[t.priority] || priorityColors.medium }}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayMeetings.length + dayTasks.length > 5 && (
                      <p className="text-[10px] text-muted-foreground px-1">
                        +{dayMeetings.length + dayTasks.length - 5} more
                      </p>
                    )}
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

function eventDate(event: GoogleCalendarEvent): string | null {
  if (event.is_all_day) return event.start_date;
  if (!event.start_at) return null;
  const date = new Date(event.start_at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function eventTime(event: GoogleCalendarEvent): string {
  if (event.is_all_day || !event.start_at) return "";
  return new Date(event.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default CalendarPage;
