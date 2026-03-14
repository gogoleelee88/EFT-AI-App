import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { signOut } from "firebase/auth";

import { auth } from "@/firebase/config";
import { loadBackendSessionUser } from "@/services/authSession";
import { resolveBackendUrl } from "@/services/http";

interface EFTUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoURL: string | null;
  level: number;
  xp: number;
  nextLevelXp: number;
  gems: number;
  badges: number;
  streak: number;
  createdAt: Date;
  lastLogin: Date;
  privacySettings: {
    dataCollection: boolean;
    aiLearning: boolean;
  };
  completedQuests: string[];
  unlockedInsights: string[];
}

type AuthSnapshot = {
  user: EFTUser | null;
  loading: boolean;
  hydrated: boolean;
};

const listeners = new Set<Dispatch<SetStateAction<AuthSnapshot>>>();

let authSnapshot: AuthSnapshot = {
  user: null,
  loading: true,
  hydrated: false,
};

let hydratePromise: Promise<void> | null = null;

const emitSnapshot = () => {
  const next = authSnapshot;
  listeners.forEach((listener) => listener(next));
};

const setAuthSnapshot = (next: AuthSnapshot) => {
  authSnapshot = next;
  emitSnapshot();
};

const mapBackendUser = (user: NonNullable<Awaited<ReturnType<typeof loadBackendSessionUser>>>) => ({
  uid: user.id,
  email: user.email ?? null,
  name: user.name ?? null,
  photoURL: user.photo_url ?? null,
  level: 1,
  xp: 0,
  nextLevelXp: 100,
  gems: 50,
  badges: 0,
  streak: 0,
  createdAt: new Date(),
  lastLogin: new Date(),
  privacySettings: { dataCollection: true, aiLearning: true },
  completedQuests: [],
  unlockedInsights: [],
});

const hydrateAuthState = async (force = false) => {
  if (!force && hydratePromise) {
    return hydratePromise;
  }

  const run = async () => {
    setAuthSnapshot({
      ...authSnapshot,
      loading: true,
    });

    try {
      const backendUser = await loadBackendSessionUser({ allowRefresh: true });
      setAuthSnapshot({
        user: backendUser ? mapBackendUser(backendUser) : null,
        loading: false,
        hydrated: true,
      });
    } catch {
      setAuthSnapshot({
        user: null,
        loading: false,
        hydrated: true,
      });
    }
  };

  hydratePromise = run().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
};

export const useAuth = () => {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(authSnapshot);

  useEffect(() => {
    listeners.add(setSnapshot);
    setSnapshot(authSnapshot);
    if (!authSnapshot.hydrated && !hydratePromise) {
      void hydrateAuthState();
    }
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(resolveBackendUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } finally {
      try {
        await signOut(auth);
      } catch {
        // Ignore local Firebase sign-out failures and still clear app state.
      }
      sessionStorage.removeItem("auth_mode");
      sessionStorage.removeItem("auth_marketing");
      sessionStorage.removeItem("auth_connect_notion");
      setAuthSnapshot({
        user: null,
        loading: false,
        hydrated: true,
      });
    }
  }, []);

  const refresh = useCallback(async () => {
    await hydrateAuthState(true);
  }, []);

  return {
    user: snapshot.user,
    loading: snapshot.loading,
    isAuthenticated: !!snapshot.user,
    logout,
    refresh,
  };
};
