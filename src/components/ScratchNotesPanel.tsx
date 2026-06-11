import { useState, useEffect, useCallback } from "react";
import { Plus, Sparkles, Trash2, StickyNote, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction } from "@/lib/edgeFunctions";
import { useToast } from "@/hooks/use-toast";
import { formatDateIST } from "@/lib/time";

interface ScratchNote {
  id: string;
  content: string;
  polished_content: string | null;
  created_at: string;
  updated_at: string;
}

function formatDbError(err: unknown): string {
  if (!err || typeof err !== "object") return "Could not save note";
  const e = err as { message?: string; code?: string; details?: string; hint?: string };
  if (e.code === "42P01" || e.message?.includes("user_scratch_notes")) {
    return "Notes database not ready. Ask admin to run: npx supabase db push --include-all";
  }
  if (e.code === "42501" || e.message?.includes("row-level security")) {
    return "Session expired. Sign out and sign in again.";
  }
  return [e.message, e.details].filter(Boolean).join(" — ") || "Could not save note";
}

export function ScratchNotesPanel({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<ScratchNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [polishingId, setPolishingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("user_scratch_notes")
      .select("id, content, polished_content, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(compact ? 5 : 50);
    if (error) {
      setLoadError(formatDbError(error));
      setNotes([]);
    } else {
      setNotes(data || []);
    }
    setLoading(false);
  }, [user, compact]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const addNote = async () => {
    if (!user || !draft.trim()) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user || session.user.id !== user.id) {
      toast({
        title: "Could not save",
        description: "Your session expired. Please sign out and sign in again.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("user_scratch_notes").insert({
        user_id: user.id,
        content: draft.trim(),
      });
      if (error) throw error;
      setDraft("");
      toast({ title: "Note saved", description: "Only you can see this note." });
      fetchNotes();
    } catch (err: unknown) {
      toast({ title: "Could not save", description: formatDbError(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const polishNote = async (note: ScratchNote) => {
    setPolishingId(note.id);
    try {
      const result = await invokeEdgeFunction<{ polished?: string; error?: string }>("polish-note", {
        body: { content: note.content },
      });
      const polished = result?.polished || note.content;
      const { error } = await supabase.from("user_scratch_notes").update({
        polished_content: polished,
        content: polished,
      }).eq("id", note.id).eq("user_id", user!.id);
      if (error) throw error;
      toast({ title: "Polished with AI", description: "Grammar and clarity improved." });
      fetchNotes();
    } catch (err: unknown) {
      toast({ title: "Polish failed", description: formatDbError(err), variant: "destructive" });
    } finally {
      setPolishingId(null);
    }
  };

  const deleteNote = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("user_scratch_notes").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      toast({ title: "Could not delete", description: formatDbError(error), variant: "destructive" });
      return;
    }
    fetchNotes();
  };

  return (
    <div className={compact ? "space-y-3" : "p-6 max-w-3xl mx-auto space-y-4"}>
      {!compact && (
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Quick Notes</h1>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Private to you — only your notes appear here. Use Polish to fix grammar with AI.
      </p>
      {loadError && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          {loadError}
        </p>
      )}
      <div className="flex gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Jot down an idea, plan, or reminder…"
          className="min-h-[72px] text-sm resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
          }}
        />
        <Button size="sm" className="shrink-0 self-end" onClick={addNote} disabled={saving || !draft.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your notes…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-xl">No notes yet — capture your first idea above.</p>
      ) : (
        <div className="space-y-2 stagger-children">
          {notes.map((n) => (
            <div key={n.id} className="card-premium p-3 group">
              <p className="text-sm text-foreground whitespace-pre-wrap">{n.polished_content || n.content}</p>
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-[10px] text-muted-foreground">
                  {formatDateIST(n.updated_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Polish with AI" onClick={() => polishNote(n)} disabled={polishingId === n.id}>
                    {polishingId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteNote(n.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
