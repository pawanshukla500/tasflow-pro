import { useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [open, setOpen] = useState(false);

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
    <Collapsible open={open} onOpenChange={setOpen} data-testid="project-sections-editor">
      <div className="flex items-center gap-2 min-h-8">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={open}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} aria-hidden />
            Sections · {sections.length}
          </button>
        </CollapsibleTrigger>
        <form
          className="flex items-center gap-1.5 flex-1 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a section"
            className="h-8 text-[13px] max-w-xs"
            aria-label="Add a section"
          />
          <Button type="submit" size="sm" variant="ghost" className="h-8 px-2" disabled={saving || !draft.trim()}>
            <Plus className="h-3.5 w-3.5" />
            <span className="sr-only">Add section</span>
          </Button>
        </form>
      </div>
      <CollapsibleContent>
        <div className="pt-2 space-y-1.5">
          {loading ? (
            <p className="text-[13px] text-muted-foreground">Loading sections…</p>
          ) : sections.length === 0 ? (
            <p className="text-[13px] text-muted-foreground py-1">
              No sections yet. Tasks stay in status columns and can look up a section.
            </p>
          ) : (
            <ol className="space-y-1">
              {sections.map((section, index) => (
                <li
                  key={section.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border bg-background px-2 py-1",
                    currentSectionId === section.id && "ring-2 ring-primary/30",
                  )}
                >
                  <span className="text-[11px] font-mono-num text-muted-foreground w-4 text-center tabular-nums">{index + 1}</span>
                  <Input
                    defaultValue={section.title}
                    className="h-8 text-[13px]"
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
            </ol>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
