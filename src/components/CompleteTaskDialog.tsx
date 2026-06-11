import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TaskRow } from "@/hooks/useTasks";
import TaskReviewDialog from "@/components/TaskReviewDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  task: TaskRow;
  onDone: () => void;
}

const CompleteTaskDialog = ({ open, onOpenChange, task, onDone }: Props) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<"me" | "all">("me");
  const [saving, setSaving] = useState(false);
  const [showReviewSubmit, setShowReviewSubmit] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;

    if (mode === "all" && task.requires_review) {
      setShowReviewSubmit(true);
      return;
    }

    setSaving(true);
    try {
      if (mode === "me") {
        const { error } = await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", task.id)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Marked your part complete");
      } else {
        const { error } = await supabase.from("tasks").update({ status: "done" }).eq("id", task.id);
        if (error) throw error;
        toast.success("Task completed for everyone");
      }
      onDone();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to complete task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open && !showReviewSubmit} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete task</DialogTitle>
            <DialogDescription className="truncate">
              "{task.title}" has {task.assignees.length} assignees. How do you want to complete it?
            </DialogDescription>
          </DialogHeader>
          {task.requires_review && (
            <p className="text-xs text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded-md px-3 py-2 bg-amber-500/5">
              This task requires audit/review. Completing for everyone will submit it for review instead of marking it done.
            </p>
          )}
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as "me" | "all")} className="space-y-3 py-2">
            <div className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/40" onClick={() => setMode("me")}>
              <RadioGroupItem value="me" id="me" className="mt-0.5" />
              <div>
                <Label htmlFor="me" className="font-medium cursor-pointer">Complete for me only</Label>
                <p className="text-xs text-muted-foreground">Removes you from this task. Others keep working on it.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-md cursor-pointer hover:bg-muted/40" onClick={() => setMode("all")}>
              <RadioGroupItem value="all" id="all" className="mt-0.5" />
              <div>
                <Label htmlFor="all" className="font-medium cursor-pointer">
                  {task.requires_review ? "Submit for review (everyone)" : "Complete for everyone"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {task.requires_review
                    ? "Sends the task to pending review for approval."
                    : "Marks the entire task as Done."}
                </p>
              </div>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={saving}>{saving ? "Saving…" : "Confirm"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showReviewSubmit && (
        <TaskReviewDialog
          open={showReviewSubmit}
          onOpenChange={(o) => {
            setShowReviewSubmit(o);
            if (!o) onOpenChange(false);
          }}
          task={task}
          mode="submit"
          onDone={() => {
            setShowReviewSubmit(false);
            onOpenChange(false);
            onDone();
          }}
        />
      )}
    </>
  );
};

export default CompleteTaskDialog;
