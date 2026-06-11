import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InAppNotification {
  id: string;
  notification_type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function useInAppNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("in_app_notifications")
      .select("id, notification_type, title, body, action_url, read_at, created_at, metadata")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) setNotifications((data as InAppNotification[]) || []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`in-app-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "in_app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as InAppNotification;
          setNotifications((prev) => [row, ...prev.filter((n) => n.id !== row.id)].slice(0, 50));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markRead = async (id: string) => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    await supabase
      .from("in_app_notifications")
      .update({ read_at: now })
      .eq("id", id)
      .eq("user_id", user.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)),
    );
  };

  const markAllRead = async () => {
    if (!user?.id || unreadCount === 0) return;
    const now = new Date().toISOString();
    await supabase
      .from("in_app_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
  };

  return { notifications, unreadCount, loading, markRead, markAllRead, refetch: fetchNotifications };
}
