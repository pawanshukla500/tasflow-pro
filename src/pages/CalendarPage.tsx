import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, RefreshCw, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTasks, type TaskRow } from "@/hooks/useTasks";
import EditTaskModal from "@/components/EditTaskModal";
import { todayIST, formatDateIST } from "@/lib/time";
import {
  calendarRangeForMonth,
  getGoogleConnection,
  listGoogleCalendarEvents,
  syncGoogleCalendar,
  type GoogleCalendarEvent,
} from "@/lib/googleIntegration";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

const priorityColors: Record<string, string> = {
  critical: "hsl(var(--destructive))",
  high: "hsl(var(--warning))",
  medium: "hsl(var(--primary))",
  low: "hsl(var(--success))",
};

const CalendarPage = () => {
  const { tasks, loading, fetchTasks } = useTasks();
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleLoading, setGoogleLoading] = useState(false);
  const today = todayIST();
  const [selectedDate, setSelectedDate] = useState(today);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

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
    <div className="p-4 md:p-6 space-y-4 max-w-6xl page-enter">
      <PageHeader
        title="Calendar"
        description="Due tasks and Google meetings. Choose a day, then open the task."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={prev} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-foreground min-w-[9rem] text-center">
              {formatDateIST(currentDate, { month: "long", year: "numeric" })}
            </span>
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={next} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-11" onClick={goToday}>Today</Button>
            {googleConnected && (
              <Button variant="outline" size="sm" className="h-11" onClick={handleSyncGoogle} disabled={googleLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${googleLoading ? "animate-spin" : ""}`} />
                Sync
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="bg-card rounded-2xl border border-border/80 overflow-hidden shadow-sm">
            <div className="grid grid-cols-7">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-xs font-semibold text-muted-foreground text-center py-2 border-b">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                if (day === null) return <div key={i} className="min-h-[108px] border-b border-r bg-muted/30" />;
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayTasks = tasks.filter(t => t.due_date === dateStr);
                const dayMeetings = googleEvents.filter((event) => eventDate(event) === dateStr);
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    className={`min-h-[108px] border-b border-r p-1.5 text-left transition-colors ${isSelected ? "bg-accent/60" : "hover:bg-muted/40"}`}
                    aria-pressed={isSelected}
                    aria-label={`${dateStr}, ${dayTasks.length} tasks`}
                  >
                    <span className={`text-xs inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? "bg-primary text-primary-foreground font-bold" : "text-foreground"}`}>
                      {day}
                    </span>
                    <span className="mt-1 flex gap-1" aria-hidden>
                      {dayTasks.slice(0, 3).map((task) => (
                        <span key={task.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }} />
                      ))}
                      {dayMeetings.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayTasks.slice(0, 2).map(t => (
                        <span
                          key={t.id}
                          className="block w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate text-primary-foreground"
                          style={{ backgroundColor: priorityColors[t.priority] || priorityColors.medium }}
                        >
                          {t.title}
                        </span>
                      ))}
                      {dayMeetings.length + dayTasks.length > 2 && (
                        <span className="block text-[10px] text-muted-foreground px-1">
                          +{dayMeetings.length + Math.max(dayTasks.length - 2, 0)} more
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="bg-card rounded-2xl border border-border/80 p-4 shadow-sm h-fit">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Selected day</p>
            <h2 className="mt-1 text-base font-semibold">{formatDateIST(selectedDate)}</h2>
            <div className="mt-3 space-y-2">
              {tasks.filter((task) => task.due_date === selectedDate).length === 0 && googleEvents.filter((event) => eventDate(event) === selectedDate).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due on this day.</p>
              ) : null}
              {googleEvents.filter((event) => eventDate(event) === selectedDate).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => {
                    const url = event.hangout_link || event.html_link;
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  }}
                  className="w-full min-h-11 text-left text-sm px-3 py-2 rounded-xl border bg-sky-50 text-sky-950 hover:bg-sky-100"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {event.hangout_link ? <Video className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />}
                    {eventTime(event)} {event.title}
                  </span>
                </button>
              ))}
              {tasks.filter((task) => task.due_date === selectedDate).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setOpenTask(task)}
                  className="w-full min-h-11 text-left text-sm px-3 py-2 rounded-xl text-primary-foreground"
                  style={{ backgroundColor: priorityColors[task.priority] || priorityColors.medium }}
                >
                  {task.title}
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}
      {openTask && (
        <EditTaskModal task={openTask} onClose={() => setOpenTask(null)} onSaved={fetchTasks} />
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
