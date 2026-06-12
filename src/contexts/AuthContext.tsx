import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";
import {
  firebaseSignIn,
  firebaseSignUpOrSignIn,
  firebaseSignOutUser,
  subscribeFirebaseAuth,
  getFirebaseIdToken,
} from "@/integrations/firebase/auth";
import { bridgeFirebaseToSupabase, registerOrganizationViaEdge } from "@/lib/authBridge";
import { getFirebaseAuth } from "@/integrations/firebase/client";
import {
  hasFullAccess,
  isDepartmentManager,
  isHRMember,
  isManagerOrAbove,
  resolveAccessScope,
  type AccessScope,
} from "@/lib/accessControl";

export type AppRole = Enums<"app_role">;

export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  domain_type: string;
  settings: Record<string, unknown>;
}

export interface AuthUser {
  id: string;
  email: string;
  profile: Tables<"profiles"> | null;
  organization: Organization | null;
  roles: AppRole[];
  managedDepartments: string[];
  departmentName: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  registerOrganization: (params: {
    orgName: string;
    domain?: string;
    domainType: "custom" | "public";
    allowPublicEmail?: boolean;
  }) => Promise<void>;
  /** Sign up (or sign in if email exists) then create organization — used on Register Org tab. */
  registerOrganizationWithAccount: (params: {
    email: string;
    password: string;
    name: string;
    orgName: string;
    domain?: string;
    domainType: "custom" | "public";
    allowPublicEmail?: boolean;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  isAdminOrMD: boolean;
  isDeptManager: boolean;
  isHR: boolean;
  isOrgAdmin: boolean;
  /** System Admin + Managing Director — full org access */
  hasFullAccess: boolean;
  /** HOD / Team Leader */
  isManager: boolean;
  /** Manager, HR, or leadership */
  isManagerOrAbove: boolean;
  accessScope: AccessScope;
  canManageDept: (deptId: string) => boolean;
  refetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async (userId: string, email: string) => {
    const [profileRes, rolesRes, deptMgrRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("department_managers").select("department_id").eq("user_id", userId),
    ]);

    const roles = (rolesRes.data || []).map((r) => r.role);
    const managedDepts = (deptMgrRes.data || []).map((d) => d.department_id);

    let departmentName: string | null = null;
    if (profileRes.data?.department_id) {
      const { data: dept } = await supabase
        .from("departments")
        .select("name")
        .eq("id", profileRes.data.department_id)
        .maybeSingle();
      departmentName = dept?.name ?? null;
    }

    let organization: Organization | null = null;
    const orgId = (profileRes.data as { organization_id?: string } | null)?.organization_id;
    if (orgId) {
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, slug, domain, domain_type, settings")
        .eq("id", orgId)
        .maybeSingle();
      if (!orgErr && org) organization = org as Organization;
    }

    setUser({
      id: userId,
      email,
      profile: profileRes.data,
      organization,
      roles,
      managedDepartments: managedDepts,
      departmentName,
    });
  }, []);

  useEffect(() => {
    let currentUid: string | null = null;
    let bridged = false;

    const unsubFirebase = subscribeFirebaseAuth(async (fbUser) => {
      if (!fbUser) {
        currentUid = null;
        bridged = false;
        setUser(null);
        setLoading(false);
        return;
      }

      if (fbUser.uid === currentUid && bridged) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const idToken = await fbUser.getIdToken();
        const { userId } = await bridgeFirebaseToSupabase(idToken, {
          email: fbUser.email,
          name: fbUser.displayName,
          firebaseUid: fbUser.uid,
        });
        currentUid = fbUser.uid;
        bridged = true;
        await fetchUserData(userId, fbUser.email || "");
      } catch (err) {
        console.error("Auth bridge error:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubFirebase();
  }, [fetchUserData]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      await firebaseSignIn(email, password);
      const idToken = await getFirebaseIdToken(true);
      if (!idToken) throw new Error("Failed to get Firebase token");
      const fbUser = getFirebaseAuth()?.currentUser;
      const { userId } = await bridgeFirebaseToSupabase(idToken, {
        email,
        name: fbUser?.displayName,
        firebaseUid: fbUser?.uid,
      });
      await fetchUserData(userId, email);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    await firebaseSignUpOrSignIn(email, password, name);
    const idToken = await getFirebaseIdToken(true);
    if (!idToken) throw new Error("Failed to get Firebase token");
    const fbUser = getFirebaseAuth()?.currentUser;
    await bridgeFirebaseToSupabase(idToken, { email, name, firebaseUid: fbUser?.uid });
  };

  const registerOrganizationWithAccount = async (params: {
    email: string;
    password: string;
    name: string;
    orgName: string;
    domain?: string;
    domainType: "custom" | "public";
    allowPublicEmail?: boolean;
  }) => {
    const { email, password, name, orgName, domain, domainType, allowPublicEmail } = params;
    await firebaseSignUpOrSignIn(email, password, name);
    const idToken = await getFirebaseIdToken(true);
    if (!idToken) throw new Error("Failed to get Firebase token");
    const fbUser = getFirebaseAuth()?.currentUser;

    // Server-side registration first: RLS blocks clients from granting roles
    await registerOrganizationViaEdge(idToken, { orgName, domain, domainType, allowPublicEmail });

    const { userId } = await bridgeFirebaseToSupabase(idToken, { email, name, firebaseUid: fbUser?.uid });
    await fetchUserData(userId, email);
  };

  const registerOrganization = async (params: {
    orgName: string;
    domain?: string;
    domainType: "custom" | "public";
    allowPublicEmail?: boolean;
  }) => {
    const idToken = await getFirebaseIdToken(true);
    if (!idToken) throw new Error("Not signed in — sign in with Firebase first");
    const fbUser = getFirebaseAuth()?.currentUser;
    if (!fbUser) throw new Error("Not signed in");

    await registerOrganizationViaEdge(idToken, params);
    const { userId } = await bridgeFirebaseToSupabase(idToken, {
      email: fbUser.email,
      name: fbUser.displayName,
      firebaseUid: fbUser.uid,
    });
    await fetchUserData(userId, fbUser.email || "");
  };

  const signOut = async () => {
    setUser(null);
    setLoading(false);
    try {
      await firebaseSignOutUser();
    } catch (e) {
      console.warn("Firebase signOut:", e);
    }
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (e) {
      console.warn("Supabase signOut:", e);
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-") && k.endsWith("-auth-token"))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  };

  const refetchProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await fetchUserData(session.user.id, session.user.email || "");
  };

  const roles = user?.roles ?? [];
  const isAdminOrMD = hasFullAccess(roles);
  const isDeptManager = isDepartmentManager(roles);
  const isHR = isHRMember(roles);
  const isOrgAdmin = isAdminOrMD || (user?.organization?.id ? true : false);
  const accessScope = resolveAccessScope(user);
  const canManageDept = (deptId: string) => isAdminOrMD || user?.managedDepartments.includes(deptId) || false;

  return (
    <AuthContext.Provider value={{
      user, loading, signIn, signUp, registerOrganization, registerOrganizationWithAccount, signOut,
      isAdminOrMD, isDeptManager, isHR, isOrgAdmin,
      hasFullAccess: isAdminOrMD,
      isManager: isDeptManager,
      isManagerOrAbove: isManagerOrAbove(roles),
      accessScope,
      canManageDept, refetchProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
