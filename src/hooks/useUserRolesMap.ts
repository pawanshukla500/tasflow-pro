import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/contexts/AuthContext";

/** user_id → roles (fetched once per mount). */
export function useUserRolesMap() {
  const [rolesByUserId, setRolesByUserId] = useState<Map<string, AppRole[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    supabase.from("user_roles").select("user_id, role").then(({ data }) => {
      if (cancelled) return;
      const map = new Map<string, AppRole[]>();
      for (const row of data || []) {
        const roles = map.get(row.user_id) || [];
        roles.push(row.role as AppRole);
        map.set(row.user_id, roles);
      }
      setRolesByUserId(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return rolesByUserId;
}
