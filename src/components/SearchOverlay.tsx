import { useState, useEffect } from "react";
import { Search, X, FileText, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateIST } from "@/lib/time";

interface SearchOverlayProps {
  onClose: () => void;
  onSelectTask: (taskId: string) => void;
}

interface TaskHit { id: string; title: string; due_date: string | null; department_name: string | null; }
interface UserHit { id: string; name: string; email: string; position: string | null; }

const SearchOverlay = ({ onClose, onSelectTask }: SearchOverlayProps) => {
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<TaskHit[]>([]);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (query.length < 2) { setTasks([]); setUsers([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const [tRes, uRes, dRes] = await Promise.all([
        supabase.from("tasks").select("id, title, due_date, department_id").ilike("title", `%${query}%`).limit(8),
        supabase.from("profiles").select("id, name, email, position").or(`name.ilike.%${query}%,email.ilike.%${query}%`).eq("active", true).limit(8),
        supabase.from("departments").select("id, name"),
      ]);
      const depts = dRes.data || [];
      setTasks((tRes.data || []).map(t => ({
        id: t.id, title: t.title, due_date: t.due_date,
        department_name: depts.find(d => d.id === t.department_id)?.name || null,
      })));
      setUsers((uRes.data || []) as UserHit[]);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <>
      <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm z-50 animate-fade-in" onClick={onClose} />
      <div className="fixed inset-x-0 top-[15%] z-50 flex justify-center px-4">
        <div className="bg-card rounded-xl border shadow-2xl w-full max-w-xl animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input autoFocus className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground" placeholder="Search tasks and people…" value={query} onChange={e => setQuery(e.target.value)} />
            <button onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {query.length < 2 && (
              <p className="text-xs text-muted-foreground px-3 py-6 text-center">Type at least 2 characters to search…</p>
            )}
            {query.length >= 2 && loading && (
              <p className="text-xs text-muted-foreground px-3 py-6 text-center">Searching…</p>
            )}
            {tasks.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] uppercase text-muted-foreground px-3 py-1 font-medium">Tasks</p>
                {tasks.map(t => (
                  <button key={t.id} onClick={() => { onSelectTask(t.id); onClose(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-left">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.department_name || "No department"}
                        {t.due_date && ` · Due ${formatDateIST(t.due_date)}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {users.length > 0 && (
              <div>
                <p className="text-[10px] uppercase text-muted-foreground px-3 py-1 font-medium">People</p>
                {users.map(u => (
                  <button key={u.id} className="w-full flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted text-left">
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.position || u.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!loading && query.length >= 2 && tasks.length === 0 && users.length === 0 && (
              <p className="text-sm text-muted-foreground px-3 py-6 text-center">No results found</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SearchOverlay;
