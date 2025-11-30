import { useState, useEffect } from 'react';

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

  useEffect(() => {
    // 🔥 데모 모드 비활성화 - 랜딩페이지 우선 표시
    // 12월 1-7일까지는 로그인 없이 랜딩페이지만 표시
    setTimeout(() => {
      setUser(null); // 로그인 안 된 상태
      setLoading(false);
    }, 500); // 스플래시 효과만 유지
  }, []);

  const logout = () => {
    setUser(null);
  };

  return {
    user,
    loading,
    isAuthenticated: !!user,
    logout
  };
};
