import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MessageSquarePlus, Send, Users, Search, MessageCircle, Settings2, UserPlus, UserMinus, Pencil, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatTimeIST } from "@/lib/time";

interface Profile { id: string; name: string; email: string; avatar_url: string | null; }
interface Conversation {
  id: string;
  is_group: boolean;
  title: string | null;
  created_by: string;
  last_message_at: string;
  participants: string[]; // user ids
  lastMessage?: string;
}
interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

const initials = (n?: string) => (n || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const InboxPage = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newSearch, setNewSearch] = useState("");
  const [newPicked, setNewPicked] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [convoSearch, setConvoSearch] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [manageTitle, setManageTitle] = useState("");
  const [manageAddSearch, setManageAddSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const [pendingLeave, setPendingLeave] = useState<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, name, email, avatar_url").eq("active", true).order("name");
    setProfiles((data || []) as Profile[]);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    // get conversations the user is in
    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);
    const convoIds = (parts || []).map((p: any) => p.conversation_id);
    if (convoIds.length === 0) { setConversations([]); setLoading(false); return; }

    const [{ data: convos }, { data: allParts }, { data: lastMsgs }] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convoIds).order("last_message_at", { ascending: false }),
      supabase.from("conversation_participants").select("conversation_id, user_id").in("conversation_id", convoIds),
      supabase.from("chat_messages").select("conversation_id, body, created_at").in("conversation_id", convoIds).order("created_at", { ascending: false }),
    ]);
    const lastByConvo = new Map<string, string>();
    (lastMsgs || []).forEach((m: any) => { if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m.body); });

    const merged: Conversation[] = (convos || []).map((c: any) => ({
      ...c,
      participants: (allParts || []).filter((p: any) => p.conversation_id === c.id).map((p: any) => p.user_id),
      lastMessage: lastByConvo.get(c.id),
    }));
    setConversations(merged);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchProfiles();
    fetchConversations();
  }, [fetchProfiles, fetchConversations]);

  // Ask for browser notification permission once
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Play a short ding using WebAudio (no asset needed)
  const playDing = useCallback(() => {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch {}
  }, []);

  // Realtime: any new message bumps conversation list & if active, append
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel("inbox-chat")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as ChatMessage;
        const fromMe = m.sender_id === user.id;

        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === m.conversation_id);
          if (idx < 0) { fetchConversations(); return prev; }
          const updated = { ...prev[idx], lastMessage: m.body, last_message_at: m.created_at };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        });
        if (m.conversation_id === activeConvoId) {
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        }

        // Sound + browser notification for incoming messages only
        if (!fromMe) {
          playDing();
          const senderProf = profiles.find((p) => p.id === m.sender_id);
          const senderLabel = senderProf?.name || "New message";
          // Toast inside app
          toast(senderLabel, { description: m.body.slice(0, 120) });
          // Browser notification when tab not focused
          if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
            try {
              const n = new Notification(senderLabel, { body: m.body.slice(0, 140), tag: m.conversation_id });
              n.onclick = () => { window.focus(); setActiveConvoId(m.conversation_id); n.close(); };
            } catch {}
          }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, activeConvoId, fetchConversations, profiles, playDing]);

  // Load messages when activeConvo changes
  useEffect(() => {
    if (!activeConvoId) { setMessages([]); return; }
    supabase
      .from("chat_messages")
      .select("*")
      .eq("conversation_id", activeConvoId)
      .order("created_at", { ascending: true })
      .then(({ data }) => setMessages((data || []) as ChatMessage[]));
  }, [activeConvoId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const convoTitle = (c: Conversation) => {
    if (c.title) return c.title;
    if (c.is_group) return `Group (${c.participants.length})`;
    const otherId = c.participants.find((id) => id !== user?.id);
    return profiles.find((p) => p.id === otherId)?.name || "Direct message";
  };

  const sendMessage = async () => {
    if (!draft.trim() || !activeConvoId || !user?.id) return;
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: activeConvoId,
      sender_id: user.id,
      body,
    });
    if (error) { toast.error(error.message); setDraft(body); }
  };

  const startNewChat = async () => {
    if (!user?.id) return;
    if (newPicked.length === 0) return toast.error("Pick at least one person");
    const isGroup = newPicked.length > 1;

    // For DMs, look up existing 1:1 with the same other person
    if (!isGroup) {
      const otherId = newPicked[0];
      const existing = conversations.find((c) => !c.is_group && c.participants.length === 2 && c.participants.includes(otherId) && c.participants.includes(user.id));
      if (existing) {
        setActiveConvoId(existing.id);
        setShowNew(false); setNewPicked([]); setNewTitle(""); setNewSearch("");
        return;
      }
    }

    const { data: newConvoId, error } = await supabase.rpc("create_conversation_with_participants", {
      _is_group: isGroup,
      _title: isGroup ? (newTitle.trim() || null) : null,
      _participant_ids: newPicked.filter((id) => id !== user.id),
    });
    if (error || !newConvoId) { toast.error(error?.message || "Failed to create chat"); return; }

    setShowNew(false); setNewPicked([]); setNewTitle(""); setNewSearch("");
    await fetchConversations();
    setActiveConvoId(newConvoId as string);
  };

  const filteredConvos = conversations.filter((c) => {
    if (!convoSearch.trim()) return true;
    const q = convoSearch.toLowerCase();
    return convoTitle(c).toLowerCase().includes(q) || (c.lastMessage || "").toLowerCase().includes(q);
  });

  const filteredPeople = profiles.filter((p) => p.id !== user?.id && (
    !newSearch.trim() || p.name.toLowerCase().includes(newSearch.toLowerCase()) || p.email.toLowerCase().includes(newSearch.toLowerCase())
  ));

  const activeConvo = conversations.find((c) => c.id === activeConvoId);
  const senderName = (id: string) => profiles.find((p) => p.id === id)?.name || "Unknown";

  const saveGroupTitle = async () => {
    if (!activeConvo) return;
    const newT = manageTitle.trim() || null;
    const { error } = await supabase.from("conversations").update({ title: newT }).eq("id", activeConvo.id);
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.map((c) => c.id === activeConvo.id ? { ...c, title: newT } : c));
    toast.success("Group renamed");
  };

  const removeMember = async (uid: string) => {
    if (!activeConvo) return;
    if (uid === activeConvo.created_by) return toast.error("Can't remove the group creator");
    const { error } = await supabase.from("conversation_participants").delete().eq("conversation_id", activeConvo.id).eq("user_id", uid);
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.map((c) => c.id === activeConvo.id ? { ...c, participants: c.participants.filter((p) => p !== uid) } : c));
    toast.success("Member removed");
  };

  const addMember = async (uid: string) => {
    if (!activeConvo) return;
    if (activeConvo.participants.includes(uid)) return;
    const { error } = await supabase.from("conversation_participants").insert({ conversation_id: activeConvo.id, user_id: uid });
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.map((c) => c.id === activeConvo.id ? { ...c, participants: [...c.participants, uid] } : c));
    toast.success("Member added");
  };

  const deleteConversation = async (c: Conversation) => {
    const { error } = await supabase.rpc("delete_conversation_cascade", { _conv_id: c.id });
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.filter((x) => x.id !== c.id));
    if (activeConvoId === c.id) setActiveConvoId(null);
    setPendingDelete(null);
    setShowManage(false);
    toast.success("Chat deleted");
  };

  const leaveConversation = async (c: Conversation) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", c.id)
      .eq("user_id", user.id);
    if (error) return toast.error(error.message);
    setConversations((prev) => prev.filter((x) => x.id !== c.id));
    if (activeConvoId === c.id) setActiveConvoId(null);
    setPendingLeave(null);
    toast.success("Left chat");
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      {/* Left: conversation list */}
      <div className="w-72 border-r flex flex-col bg-card">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-bold text-foreground">Inbox</h1>
            <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => setShowNew(true)}>
              <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />New
            </Button>
          </div>
          <div className="relative">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={convoSearch}
              onChange={(e) => setConvoSearch(e.target.value)}
              placeholder="Search chats..."
              className="h-7 text-xs pl-7"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-xs text-muted-foreground p-4">Loading…</p>
          ) : filteredConvos.length === 0 ? (
            <div className="text-center p-6">
              <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No conversations yet</p>
              <Button size="sm" variant="link" className="text-xs mt-1" onClick={() => setShowNew(true)}>Start one</Button>
            </div>
          ) : (
            filteredConvos.map((c) => {
              const isCreator = c.created_by === user?.id;
              return (
                <div
                  key={c.id}
                  className={`group relative w-full border-b hover:bg-muted/40 transition-colors ${activeConvoId === c.id ? "bg-muted" : ""}`}
                >
                  <button
                    onClick={() => setActiveConvoId(c.id)}
                    className="w-full text-left px-3 py-2.5 pr-9"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${c.is_group ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {c.is_group ? <Users className="h-3.5 w-3.5" /> : initials(convoTitle(c))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{convoTitle(c)}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{c.lastMessage || "No messages yet"}</p>
                      </div>
                    </div>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10"
                    title={isCreator ? "Delete chat" : "Leave chat"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isCreator) setPendingDelete(c);
                      else setPendingLeave(c);
                    }}
                  >
                    {isCreator ? <Trash2 className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right: messages */}
      <div className="flex-1 flex flex-col">
        {!activeConvo ? (
          <div className="flex-1 flex items-center justify-center text-center p-8">
            <div>
              <MessageCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Pick a conversation</p>
              <p className="text-xs text-muted-foreground mt-1">Or start a new one with anyone on the team</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b bg-card flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-semibold ${activeConvo.is_group ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {activeConvo.is_group ? <Users className="h-3.5 w-3.5" /> : initials(convoTitle(activeConvo))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{convoTitle(activeConvo)}</p>
                {activeConvo.is_group && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeConvo.participants.map((id) => senderName(id)).join(", ")}
                  </p>
                )}
              </div>
              {activeConvo.is_group && activeConvo.created_by === user?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => { setManageTitle(activeConvo.title || ""); setShowManage(true); }}
                >
                  <Settings2 className="h-3.5 w-3.5 mr-1" />Manage
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-background">
              {messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No messages yet — say hi 👋</p>
              ) : messages.map((m) => {
                const isMe = m.sender_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {!isMe && activeConvo.is_group && (
                        <span className="text-[10px] text-muted-foreground px-2">{senderName(m.sender_id)}</span>
                      )}
                      <div className={`px-3 py-2 rounded-lg text-sm ${isMe ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                        {m.body}
                      </div>
                      <span className="text-[10px] text-muted-foreground px-2">
                        {formatTimeIST(m.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-3 border-t bg-card flex gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                }}
                placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
                className="resize-none min-h-[40px] max-h-32 text-sm"
                rows={1}
              />
              <Button onClick={sendMessage} disabled={!draft.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* New chat dialog */}
      <Dialog open={showNew} onOpenChange={(o) => { if (!o) { setShowNew(false); setNewPicked([]); setNewTitle(""); setNewSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start a new chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Pick one person for a direct message, or multiple to start a group chat.
            </p>
            <div className="relative">
              <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={newSearch}
                onChange={(e) => setNewSearch(e.target.value)}
                placeholder="Search team members..."
                className="h-8 text-xs pl-7"
              />
            </div>
            {newPicked.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">Group name (optional)</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Myntra Ops" className="h-8 text-xs" />
              </div>
            )}
            {newPicked.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {newPicked.map((id) => {
                  const p = profiles.find((x) => x.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="text-[10px] cursor-pointer" onClick={() => setNewPicked((prev) => prev.filter((x) => x !== id))}>
                      {p?.name || "?"} ✕
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {filteredPeople.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No team members found</p>
              ) : filteredPeople.map((p) => {
                const picked = newPicked.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => setNewPicked((prev) => picked ? prev.filter((x) => x !== p.id) : [...prev, p.id])}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center gap-2 ${picked ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                      {initials(p.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                    </div>
                    {picked && <Badge variant="default" className="text-[10px]">Selected</Badge>}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNew(false); setNewPicked([]); setNewTitle(""); setNewSearch(""); }}>Cancel</Button>
            <Button onClick={startNewChat} disabled={newPicked.length === 0}>
              {newPicked.length > 1 ? `Create group (${newPicked.length})` : "Start chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage group dialog (creator only) */}
      <Dialog open={showManage} onOpenChange={setShowManage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage group</DialogTitle>
          </DialogHeader>
          {activeConvo && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Pencil className="h-3 w-3" />Group name</Label>
                <div className="flex gap-2">
                  <Input value={manageTitle} onChange={(e) => setManageTitle(e.target.value)} placeholder="e.g. Myntra Ops" className="h-8 text-xs" />
                  <Button size="sm" onClick={saveGroupTitle} className="h-8">Save</Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Members ({activeConvo.participants.length})</Label>
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {activeConvo.participants.map((pid) => {
                    const p = profiles.find((x) => x.id === pid);
                    const isCreator = pid === activeConvo.created_by;
                    return (
                      <div key={pid} className="px-2 py-1.5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold">{initials(p?.name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{p?.name || "Unknown"}{isCreator && <span className="text-[10px] text-muted-foreground ml-1">(creator)</span>}</p>
                        </div>
                        {!isCreator && (
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive" onClick={() => removeMember(pid)}>
                            <UserMinus className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><UserPlus className="h-3 w-3" />Add members</Label>
                <Input value={manageAddSearch} onChange={(e) => setManageAddSearch(e.target.value)} placeholder="Search team..." className="h-8 text-xs" />
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {profiles
                    .filter((p) => !activeConvo.participants.includes(p.id) && (!manageAddSearch.trim() || p.name.toLowerCase().includes(manageAddSearch.toLowerCase())))
                    .slice(0, 50)
                    .map((p) => (
                      <button key={p.id} onClick={() => addMember(p.id)} className="w-full text-left px-2 py-1.5 hover:bg-muted/40 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold">{initials(p.name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                        </div>
                        <UserPlus className="h-3.5 w-3.5 text-primary" />
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {activeConvo && activeConvo.created_by === user?.id && (
              <Button variant="destructive" size="sm" onClick={() => setPendingDelete(activeConvo)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Delete chat
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowManage(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the conversation and all messages for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteConversation(pendingDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave confirm */}
      <AlertDialog open={!!pendingLeave} onOpenChange={(o) => !o && setPendingLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll stop receiving messages from this conversation. The chat itself isn't deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingLeave && leaveConversation(pendingLeave)}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InboxPage;
