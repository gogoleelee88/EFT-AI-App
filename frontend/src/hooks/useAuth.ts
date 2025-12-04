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
  // 🔧 12월 5일 발표용: 즉시 로그인 상태로 시작
  const [user, setUser] = useState<EFTUser | null>({
    uid: 'dev-user-001',
    email: 'dev@test.com',
    name: '개발자',
    photoURL: null,
    level: 1,
    xp: 0,
    nextLevelXp: 100,
    gems: 0,
    badges: 0,
    streak: 0,
    createdAt: new Date(),
    lastLogin: new Date(),
    privacySettings: {
      dataCollection: true,
      aiLearning: true,
    },
    completedQuests: [],
    unlockedInsights: [],
  });
  const [loading, setLoading] = useState(false); // 즉시 false로 시작

  // 🔧 기존 코드 (주석 처리)
  // useEffect(() => {
  //   setTimeout(() => {
  //     setUser({ ... });
  //     setLoading(false);
  //   }, 500);
  // }, []);

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
