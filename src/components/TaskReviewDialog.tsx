import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import type { TaskRow } from "@/hooks/useTasks";
import { canApproveOrRejectReview, canSubmitForReview } from "@/lib/taskPermissions";

type Mode = "submit" | "approve" | "reject";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskRow | null;
  mode: Mode;
  onDone: () => void;
}

export default function TaskReviewDialog({ open, onOpenChange, task, mode, onDone }: Props) {
  const { user, isAdminOrMD, managedDepartments } = useAuth();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  if (!task) return null;

  const handleConfirm = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (mode === "submit") {
        if (!canSubmitForReview(task, user.id)) {
          throw new Error("You cannot submit this task for review");
        }
        const { error } = await supabase
          .from("tasks")
          .update({ status: "pending_review" })
          .eq("id", task.id);
        if (error) throw error;
        if (comment.trim()) {
          await supabase.from("task_comments").insert({
            task_id: task.id,
            user_id: user.id,
            body: comment.trim(),
            comment_type: "review_submit",
          });
        }
        toast.success("Submitted for review");
      } else if (mode === "approve") {
        if (!canApproveOrRejectReview(task, user.id, isAdminOrMD, managedDepartments || [])) {
          throw new Error("You are not authorized to approve this task");
        }
        const { error } = await supabase
          .from("tasks")
          .update({
            status: "done",
            review_note: comment.trim() || null,
          })
          .eq("id", task.id);
        if (error) throw error;
        await supabase.from("task_comments").insert({
          task_id: task.id,
          user_id: user.id,
          body: comment.trim() || "Approved — marked complete.",
          comment_type: "review_approve",
        });
        toast.success("Task approved and marked complete");
      } else {
        if (!comment.trim()) {
          toast.error("Please provide a reason for rejection");
          setSaving(false);
          return;
        }
        if (!canApproveOrRejectReview(task, user.id, isAdminOrMD, managedDepartments || [])) {
          throw new Error("You are not authorized to reject this task");
        }
        const { error } = await supabase
          .from("tasks")
          .update({
            status: "in_progress",
            review_note: comment.trim(),
          })
          .eq("id", task.id);
        if (error) throw error;
        await supabase.from("task_comments").insert({
          task_id: task.id,
          user_id: user.id,
          body: comment.trim(),
          comment_type: "review_reject",
        });
        toast.success("Task sent back for correction");
      }
      setComment("");
      onDone();
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
    }
  };

  const titles: Record<Mode, string> = {
    submit: "Submit for review",
    approve: "Approve task",
    reject: "Reject and send back",
  };

  const descriptions: Record<Mode, string> = {
    submit: "Your work will be sent to the reviewer for audit before it can be marked complete.",
    approve: "Confirm this task meets quality standards and mark it complete.",
    reject: "Explain what needs to be corrected. The assignee will see your feedback.",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[mode]}</DialogTitle>
          <DialogDescription>{descriptions[mode]}</DialogDescription>
        </DialogHeader>
        <p className="text-sm font-medium truncate">{task.title}</p>
        {task.review_note && mode !== "submit" && (
          <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
            Previous note: {task.review_note}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="review-comment">
            {mode === "reject" ? "Reason for rejection (required)" : "Comment (optional)"}
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={mode === "reject" ? "Describe what must be fixed…" : "Add context for the reviewer…"}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={mode === "reject" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={saving}
          >
            {saving ? "Saving…" : mode === "submit" ? "Submit" : mode === "approve" ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
