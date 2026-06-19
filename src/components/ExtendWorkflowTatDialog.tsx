import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  stageId: string;
  stageName: string;
  workflowTitle: string;
  currentTatHours: number;
  maxHours?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExtended?: (newTatHours: number) => void;
}

export function ExtendWorkflowTatDialog({
  stageId,
  stageName,
  workflowTitle,
  currentTatHours,
  maxHours = 168,
  open,
  onOpenChange,
  onExtended,
}: Props) {
  const [addHours, setAddHours] = useState(24);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleExtend = async () => {
    if (addHours < 1) {
      toast.error("Extension must be at least 1 hour");
      return;
    }
    if (reason.trim().length < 5) {
      toast.error("Please explain why more time is needed (at least 5 characters)");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("extend_workflow_stage_tat", {
        p_stage_id: stageId,
        p_add_hours: addHours,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      const newTat = currentTatHours + addHours;
      toast.success(`Deadline extended by ${addHours}h (new TAT: ${newTat}h)`);
      onExtended?.(newTat);
      onOpenChange(false);
      setReason("");
      setAddHours(24);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not extend deadline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extend stage deadline</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{stageName}</span>
            {" · "}
            {workflowTitle}
          </p>
          <div className="space-y-2">
            <Label>Add hours *</Label>
            <Input
              type="number"
              min={1}
              max={maxHours}
              value={addHours}
              onChange={(e) => setAddHours(Math.max(1, parseInt(e.target.value, 10) || 0))}
            />
            <p className="text-[11px] text-muted-foreground">
              Current TAT: {currentTatHours}h → New: {currentTatHours + addHours}h (max +{maxHours}h per request)
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
          <Button onClick={handleExtend} disabled={saving || addHours < 1 || reason.trim().length < 5}>
            {saving ? "Saving…" : "Extend deadline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
