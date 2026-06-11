import { useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/** Real-time in-app alerts with sound for task/workflow/system notifications. */
export default function ActivityNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const playAlert = useCallback(() => {
    try {
      const AC = (window as Window & { webkitAudioContext?: typeof AudioContext }).AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.35);
      setTimeout(() => ctx.close().catch(() => {}), 500);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const ch = supabase
      .channel(`activity-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as {
            title?: string;
            body?: string;
            action_url?: string;
            notification_type?: string;
          };

          if (n.notification_type === "message") return;

          playAlert();

          toast(n.title || "Notification", {
            description: n.body?.slice(0, 120),
            duration: 6000,
            action: n.action_url
              ? {
                  label: "Open",
                  onClick: () => navigate(n.action_url!),
                }
              : undefined,
          });

          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            document.visibilityState !== "visible"
          ) {
            try {
              const browserN = new Notification(n.title || "TaskFlow", {
                body: n.body?.slice(0, 140),
                tag: n.notification_type,
              });
              browserN.onclick = () => {
                window.focus();
                if (n.action_url) navigate(n.action_url);
                browserN.close();
              };
            } catch {
              /* ignore */
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, navigate, location.pathname, playAlert]);

  return null;
}
