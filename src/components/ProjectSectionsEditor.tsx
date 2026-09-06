import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjectSectionMutations, useProjectSections } from "@/hooks/useProjectSections";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProjectSectionsEditor({
  projectId,
  currentSectionId,
}: {
  projectId: string;
  currentSectionId?: string | null;
}) {
  const { sections, loading } = useProjectSections(projectId);
  const { create, update, remove } = useProjectSectionMutations(projectId);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setSaving(true);
    try {
      await create(title);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add section");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-card/80 px-3 py-3 md:px-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Sections</p>
          <p className="text-[11px] text-muted-foreground">
            Ordered workstreams inside this project. Tasks look up a section by ID.
          </p>
        </div>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading sections…</p>
      ) : (
        <ol className="space-y-1.5">
          {sections.map((section, index) => (
            <li
              key={section.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-background px-2 py-1.5",
                currentSectionId === section.id && "ring-2 ring-primary/30",
              )}
            >
              <span className="text-[10px] font-mono-num text-muted-foreground w-4 text-center">{index + 1}</span>
              <Input
                defaultValue={section.title}
                className="h-8 text-sm"
                onBlur={async (e) => {
                  const title = e.target.value.trim();
                  if (!title || title === section.title) return;
                  try {
                    await update(section.id, { title });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not rename");
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${section.title}`}
                onClick={async () => {
                  try {
                    await remove(section.id);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not delete");
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
          {sections.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No sections yet. Add “Design”, “Build”, “Launch” — tasks stay in status columns and look up a section.
            </p>
          )}
        </ol>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a section"
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={saving || !draft.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </form>
    </div>
  );
}
