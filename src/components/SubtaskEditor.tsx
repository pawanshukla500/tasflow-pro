import { Plus, X, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface SubtaskDraft {
  id?: string;
  title: string;
  completed?: boolean;
}

interface SubtaskEditorProps {
  subtasks: SubtaskDraft[];
  onChange: (next: SubtaskDraft[]) => void;
  disabled?: boolean;
  showCompleted?: boolean;
}

const SubtaskEditor = ({
  subtasks,
  onChange,
  disabled,
  showCompleted = false,
}: SubtaskEditorProps) => {
  const addSubtask = () => onChange([...subtasks, { title: "", completed: false }]);

  const updateAt = (index: number, patch: Partial<SubtaskDraft>) => {
    onChange(subtasks.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeAt = (index: number) => {
    onChange(subtasks.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label>Subtasks</Label>
        <Button type="button" size="sm" variant="outline" onClick={addSubtask} disabled={disabled}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add subtask
        </Button>
      </div>
      {subtasks.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Break work into smaller steps (like Asana checklists). Optional.
        </p>
      ) : (
        <ul className="space-y-2">
          {subtasks.map((st, i) => (
            <li key={st.id ?? i} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              {showCompleted && (
                <Checkbox
                  checked={!!st.completed}
                  disabled={disabled}
                  onCheckedChange={(c) => updateAt(i, { completed: !!c })}
                />
              )}
              <Input
                value={st.title}
                disabled={disabled}
                placeholder={`Subtask ${i + 1}`}
                className="h-8 text-sm"
                onChange={(e) => updateAt(i, { title: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                disabled={disabled}
                onClick={() => removeAt(i)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SubtaskEditor;
