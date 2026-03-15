import { useCallback, useEffect, useState } from "react";
import type { PrivacyMode } from "../types/privacy";
import { primePrivacySyncState, resolvePrivacyEvent } from "../services/privacySync";
import { resolveBackendUrl } from "@/config/api";
import { todayInKoreaIso } from "../utils/koreaTime";
import { useAuth } from "./useAuth";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  source: "google";
  editable?: boolean;
  description?: string;
  privacy_mode?: PrivacyMode;
  privacy_key?: string;
  display_title?: string;
  displayTitle?: string;
  maskedTitle?: string;
}

interface UseGoogleCalendarResult {
  isConnected: boolean;
  googleEvents: GoogleCalendarEvent[];
  lastSync: Date | null;
  loading: boolean;
  error: string | null;
  connectGoogle: () => Promise<void>;
  fetchGoogleEvents: (dateIso: string) => Promise<void>;
  exportToGoogle: (args: {
    taskId: number;
    startIso: string;
    durationMinutes: number;
    summary?: string;
    description?: string;
    privacyMode?: PrivacyMode;
    privacyKey?: string;
    originalTitle?: string;
    originalDescription?: string;
  }) => Promise<void>;
  updateGoogleEvent: (args: {
    eventId: string;
    startIso: string;
    endIso: string;
    summary?: string;
  }) => Promise<void>;
}

export function useGoogleCalendar(): UseGoogleCalendarResult {
  const { user, loading: authLoading } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function redirectToLogin() {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    window.location.href = `/login?next=${next}`;
  }

  // 초기 연결 상태 확인
  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setIsConnected(false);
      setGoogleEvents([]);
      setLastSync(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(resolveBackendUrl("/api/spec/google/status"), {
          credentials: "include",
        });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setIsConnected(false);
          }
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { connected?: boolean };
        if (!cancelled) {
          setIsConnected(Boolean(data.connected));
        }
      } catch {
        // status 체크 실패는 조용히 무시 (초기 개발 단계)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.uid]);

  const connectGoogle = useCallback(async () => {
    setError(null);
    if (!user?.uid) {
      redirectToLogin();
      return;
    }
    try {
      const nextPath = window.location.pathname;
      const authPath = `/api/spec/google/auth?next=${encodeURIComponent(nextPath)}`;

      const res = await fetch(resolveBackendUrl(authPath), {
        credentials: "include",
      });
      if (res.status === 401 || res.status === 403) {
        redirectToLogin();
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = (await res.json()) as { authUrl: string };
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error("authUrl이 비어 있습니다.");
      }
    } catch (e) {
      console.error("Google 연동 시작 실패:", e);
      setError("Google 캘린더 연동을 시작할 수 없습니다.");
    }
  }, [user?.uid]);

  const fetchGoogleEvents = useCallback(async (dateIso: string) => {
    setLoading(true);
    setError(null);
    try {
      if (user?.uid) {
        await primePrivacySyncState(user.uid);
      }
      const url = resolveBackendUrl(`/api/spec/google/events?date=${encodeURIComponent(dateIso.slice(0, 10))}`);
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        redirectToLogin();
        return;
      }
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const data = (await res.json()) as GoogleCalendarEvent[];
      const decorated = data.map((event) => {
        const resolved = resolvePrivacyEvent(event, user?.uid);
        if (event.privacy_mode === "MASKED" && event.display_title) {
          return {
            ...resolved,
            privacy_mode: "MASKED" as PrivacyMode,
            displayTitle: event.display_title,
            maskedTitle: event.title,
          };
        }
        return resolved;
      });
      setGoogleEvents(decorated);
      setLastSync(new Date());
    } catch (e) {
      console.error("Google 이벤트 불러오기 실패:", e);
      setError("Google 일정 불러오기에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const exportToGoogle = useCallback(
    async (args: {
      taskId: number;
      startIso: string;
      durationMinutes: number;
      summary?: string;
      description?: string;
      privacyMode?: PrivacyMode;
      privacyKey?: string;
      originalTitle?: string;
      originalDescription?: string;
    }) => {
      setError(null);
      try {
        const res = await fetch(resolveBackendUrl("/api/spec/plan/day/export"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            task_id: args.taskId,
            start: args.startIso,
            duration_minutes: args.durationMinutes,
            summary: args.summary,
            description: args.description,
            privacy_mode: args.privacyMode,
            privacy_key: args.privacyKey,
            original_title: args.originalTitle,
            original_description: args.originalDescription,
          }),
        });
        if (res.status === 401 || res.status === 403) {
          redirectToLogin();
          throw new Error("AUTH_EXPIRED");
        }
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        // 성공 시, 최신 Google 이벤트 리스트가 필요하면 호출부에서 fetchGoogleEvents를 재사용
      } catch (e) {
        console.error("Google 캘린더 내보내기 실패:", e);
        setError("Google 캘린더로 내보내는 중 오류가 발생했습니다.");
        throw e;
      }
    },
    []
  );

  const updateGoogleEvent = useCallback(
    async (args: {
      eventId: string;
      startIso: string;
      endIso: string;
      summary?: string;
    }) => {
      setError(null);
      try {
        const res = await fetch(resolveBackendUrl("/api/spec/google/events"), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            event_id: args.eventId,
            start: args.startIso,
            end: args.endIso,
            summary: args.summary,
          }),
        });
        if (res.status === 401 || res.status === 403) {
          redirectToLogin();
          throw new Error("AUTH_EXPIRED");
        }
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || `status ${res.status}`);
        }
        // 성공 시 자동으로 Google 이벤트 다시 불러오기
        const currentDate = todayInKoreaIso();
        await fetchGoogleEvents(currentDate);
      } catch (e) {
        console.error("Google 캘린더 이벤트 수정 실패:", e);
        setError("Google 캘린더 이벤트 수정 중 오류가 발생했습니다.");
        throw e;
      }
    },
    [fetchGoogleEvents]
  );

  return {
    isConnected,
    googleEvents,
    lastSync,
    loading,
    error,
    connectGoogle,
    fetchGoogleEvents,
    exportToGoogle,
    updateGoogleEvent,
  };
}
