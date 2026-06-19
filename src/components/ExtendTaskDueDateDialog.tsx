import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { maxTaskDueDateExtension, minTaskDueDateExtension } from "@/lib/taskPermissions";
import type { TaskRow } from "@/hooks/useTasks";

interface Props {
  task: Pick<TaskRow, "id" | "due_date" | "title">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtended?: (newDueDate: string) => void;
}

export function ExtendTaskDueDateDialog({ task, open, onOpenChange, onExtended }: Props) {
  const minDate = minTaskDueDateExtension(task);
  const maxDate = maxTaskDueDateExtension(task);
  const [newDate, setNewDate] = useState<Date | undefined>(minDate);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleExtend = async () => {
    if (!newDate) {
      toast.error("Pick a new due date");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Please explain why more time is needed (at least 5 characters)");
      return;
    }

    setSaving(true);
    try {
      const formatted = format(newDate, "yyyy-MM-dd");
      const { error } = await supabase.rpc("extend_task_due_date", {
        p_task_id: task.id,
        p_new_due_date: formatted,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast.success(`Due date extended to ${format(newDate, "PPP")}`);
      onExtended?.(formatted);
      onOpenChange(false);
      setReason("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not extend due date");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend due date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Task: <span className="font-medium text-foreground">{task.title}</span>
          </p>
          <div className="space-y-2">
            <Label>Current due date</Label>
            <p className="text-sm">{task.due_date ? format(new Date(task.due_date), "PPP") : "Not set"}</p>
          </div>
          <div className="space-y-2">
            <Label>New due date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal", !newDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDate ? format(newDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={setNewDate}
                  disabled={(date) => date < minDate || date > maxDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">
              You can extend up to 30 days from the current due date.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason for extension *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the issue blocking on-time completion…"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExtend} disabled={saving || !newDate || reason.trim().length < 5}>
            {saving ? "Saving…" : "Extend due date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
