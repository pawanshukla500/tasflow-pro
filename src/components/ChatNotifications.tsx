import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Global chat notifier: subscribes to chat_messages whenever the user is signed in,
 * plays a sound and shows an in-app toast for any incoming message — works on
 * every page, not just the Inbox.
 */
const ChatNotifications = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const myConvosRef = useRef<Set<string>>(new Set());

  // Ask once for browser notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

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
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
      setTimeout(() => ctx.close().catch(() => {}), 600);
    } catch {}
  }, []);

  // Track the set of conversation IDs the user is part of
  useEffect(() => {
    if (!user?.id) {
      myConvosRef.current = new Set();
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);
      if (cancelled) return;
      myConvosRef.current = new Set((data || []).map((p: any) => p.conversation_id));
    };
    load();

    // refresh when participants change (added to / removed from group)
    const partsCh = supabase
      .channel(`chat-parts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(partsCh);
    };
  }, [user?.id]);

  // Subscribe to ALL new chat messages and filter to ones in user's conversations
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`chat-global-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        async (payload) => {
          const m = payload.new as { id: string; conversation_id: string; sender_id: string; body: string };
          if (m.sender_id === user.id) return; // ignore own
          if (!myConvosRef.current.has(m.conversation_id)) return; // not my chat

          // Look up sender name (best effort)
          let senderName = "New message";
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("name")
              .eq("id", m.sender_id)
              .maybeSingle();
            if (prof?.name) senderName = prof.name;
          } catch {}

          playDing();

          // Skip toast if user is already on Inbox viewing chats — Inbox shows the message inline
          const onInbox = location.pathname.startsWith("/inbox");
          if (!onInbox) {
            toast(senderName, {
              description: m.body.slice(0, 120),
              action: {
                label: "Open",
                onClick: () => navigate("/inbox"),
              },
              duration: 6000,
            });
          }

          // Browser notification when tab not focused
          if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
            try {
              const n = new Notification(senderName, { body: m.body.slice(0, 140), tag: m.conversation_id });
              n.onclick = () => {
                window.focus();
                navigate("/inbox");
                n.close();
              };
            } catch {}
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, location.pathname, navigate, playDing]);

  return null;
};

export default ChatNotifications;
