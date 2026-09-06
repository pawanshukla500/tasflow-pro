import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, ListChecks } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  findActiveLookupQuery,
  insertInternalLink,
  parseInternalLinks,
  type LookupEntity,
} from "@/lib/projectLookup";
import { searchLookupEntities } from "@/lib/projectSectionsApi";

interface EntityLookupFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  excludeTaskId?: string;
  className?: string;
}

export function EntityLookupField({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
  excludeTaskId,
  className,
}: EntityLookupFieldProps) {
  const [hits, setHits] = useState<LookupEntity[]>([]);
  const [active, setActive] = useState<ReturnType<typeof findActiveLookupQuery>>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (next: string, caret: number) => {
    onChange(next);
    const query = findActiveLookupQuery(next, caret);
    setActive(query);
  };

  useEffect(() => {
    if (!active) {
      setHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const rows = await searchLookupEntities(active.query);
      if (cancelled) return;
      setHits(
        rows.filter((row) => !(excludeTaskId && row.kind === "task" && row.id === excludeTaskId)),
      );
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, excludeTaskId]);

  const choose = (entity: LookupEntity) => {
    if (!active) return;
    const next = insertInternalLink(value, active, entity);
    onChange(next.value);
    setActive(null);
    setHits([]);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };

  return (
    <div className="relative">
      <Textarea
        id={id}
        ref={areaRef}
        value={value}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder ?? "Describe the work. Type [[ to look up a task or project."}
        className={className}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && active) {
            e.stopPropagation();
            setActive(null);
            setHits([]);
          }
        }}
      />
      {active && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full rounded-xl border bg-popover shadow-lg max-h-56 overflow-auto">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(hit)}
              >
                {hit.kind === "project" ? (
                  <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />
                ) : (
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="truncate flex-1">{hit.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{hit.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EntityLinkPreview({ text, className }: { text: string; className?: string }) {
  const navigate = useNavigate();
  const links = parseInternalLinks(text);
  if (links.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {links.map((link) => (
        <button
          key={`${link.kind}-${link.id}-${link.label}`}
          type="button"
          className="text-[11px] rounded-md border bg-muted/50 px-1.5 py-0.5 hover:bg-muted"
          onClick={() => {
            if (link.kind === "project") navigate(`/projects/${link.id}`);
            else navigate(`/my-tasks?task=${link.id}`);
          }}
        >
          {link.kind === "project" ? "Project" : "Task"}: {link.label}
        </button>
      ))}
    </div>
  );
}
