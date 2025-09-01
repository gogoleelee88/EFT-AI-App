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
    // 데모용 사용자 데이터 (Firebase 없이 바로 체험 가능)
    const demoUser: EFTUser = {
      uid: 'demo-user-' + Date.now(),
      email: 'demo@eft-ai.com',
      name: '마음탐험가',
      photoURL: null,
      level: 3,
      xp: 2847,
      nextLevelXp: 4000,
      gems: 127,
      badges: 7,
      streak: 5,
      createdAt: new Date(),
      lastLogin: new Date(),
      privacySettings: {
        dataCollection: true,
        aiLearning: true
      },
      completedQuests: ['daily_emotion_check', 'daily_ai_chat'],
      unlockedInsights: ['procrastination', 'personality_basic', 'stress_management']
    };

    // 1초 후 데모 사용자로 로그인 (스플래시 효과)
    setTimeout(() => {
      setUser(demoUser);
      setLoading(false);
    }, 1500);
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