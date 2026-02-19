import { useCallback, useEffect, useState } from 'react';
import { resolveBackendUrl } from '@/services/http';

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

export const useAuth = () => {
  const [user, setUser] = useState<EFTUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateFromBackend = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(resolveBackendUrl('/api/auth/me'), { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data?.authenticated && data?.user) {
        setUser({
          uid: data.user.id,
          email: data.user.email ?? null,
          name: data.user.name ?? null,
          photoURL: data.user.photo_url ?? null,
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
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrateFromBackend();
  }, [hydrateFromBackend]);

  const logout = useCallback(async () => {
    try {
      await fetch(resolveBackendUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
    } finally {
      setUser(null);
    }
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    logout,
    refresh: hydrateFromBackend,
  };
};
