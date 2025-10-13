/**
 * 공지사항 서비스 - MVP to Production
 * EFT AI 앱용 공지사항 클라이언트 서비스
 */

// 🔔 공지사항 타입 정의
export interface Notice {
  id: string;
  title: string;
  body: string;
  lang: 'ko' | 'en';
  severity: 'info' | 'warning' | 'critical' | 'success';
  pinned: boolean;
  startsAt?: string;  // ISO8601
  endsAt?: string;    // ISO8601
  createdAt: string;
  updatedAt: string;
}

export interface NoticeCreate {
  title: string;
  body: string;
  lang?: 'ko' | 'en';
  severity?: 'info' | 'warning' | 'critical' | 'success';
  pinned?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface NoticeUpdate {
  title?: string;
  body?: string;
  lang?: 'ko' | 'en';
  severity?: 'info' | 'warning' | 'critical' | 'success';
  pinned?: boolean;
  startsAt?: string;
  endsAt?: string;
}

export interface NoticeResponse {
  items: Notice[];
  etag?: string;
  notModified?: boolean;
}

// 🌐 API 설정 (상대경로 - 동일 오리진)
const NOTICES_API = '/api/notices';

// 📱 클라이언트 상태 관리
class NoticeCache {
  private cache: Notice[] = [];
  private etag: string | null = null;
  private lastFetch: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5분

  isExpired(): boolean {
    return Date.now() - this.lastFetch > this.CACHE_TTL;
  }

  set(notices: Notice[], etag?: string): void {
    this.cache = notices;
    this.etag = etag || null;
    this.lastFetch = Date.now();
  }

  get(): { notices: Notice[]; etag: string | null } {
    return {
      notices: this.cache,
      etag: this.etag
    };
  }

  clear(): void {
    this.cache = [];
    this.etag = null;
    this.lastFetch = 0;
  }
}

const cache = new NoticeCache();

// 🛠️ 유틸리티 함수
export function getSeverityColor(severity: Notice['severity']): string {
  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
    success: 'bg-green-50 border-green-200 text-green-800'
  };
  return colors[severity] || colors.info;
}

export function getSeverityIcon(severity: Notice['severity']): string {
  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
    success: '✅'
  };
  return icons[severity] || icons.info;
}

export function formatNoticeDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) {
      return '방금 전';
    } else if (diffHours < 24) {
      return `${diffHours}시간 전`;
    } else if (diffDays < 7) {
      return `${diffDays}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR');
    }
  } catch {
    return dateString;
  }
}

// 🌍 다국어 지원
export function getCurrentLanguage(): 'ko' | 'en' {
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith('ko') ? 'ko' : 'en';
}

// 📡 API 클라이언트
export class NoticeService {
  private adminApiKey: string | null = null;

  setAdminApiKey(key: string): void {
    this.adminApiKey = key;
  }

  /**
   * 활성 공지사항 목록 조회 (공개)
   */
  async fetchNotices(options: {
    lang?: string;
    useCache?: boolean;
    forceRefresh?: boolean;
  } = {}): Promise<NoticeResponse> {
    const { lang = getCurrentLanguage(), useCache = true, forceRefresh = false } = options;

    try {
      // 캐시 사용 여부 확인
      if (useCache && !forceRefresh && !cache.isExpired()) {
        const cached = cache.get();
        if (cached.notices.length > 0) {
          return {
            items: cached.notices.filter(n => !lang || n.lang === lang),
            etag: cached.etag || undefined,
            notModified: true
          };
        }
      }

      // API 요청 헤더 구성
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // ETag 기반 캐싱
      const cached = cache.get();
      if (cached.etag && !forceRefresh) {
        headers['If-None-Match'] = cached.etag;
      }

      // API 호출
      const url = new URL(NOTICES_API);
      if (lang) {
        url.searchParams.set('lang', lang);
      }

      const response = await fetch(url.toString(), { headers });

      // 304 Not Modified 처리
      if (response.status === 304) {
        return {
          items: cached.notices.filter(n => !lang || n.lang === lang),
          etag: cached.etag || undefined,
          notModified: true
        };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const notices: Notice[] = await response.json();
      const etag = response.headers.get('ETag') || undefined;

      // 캐시 업데이트
      cache.set(notices, etag);

      return {
        items: notices,
        etag,
        notModified: false
      };

    } catch (error) {
      console.error('공지사항 조회 실패:', error);

      // 에러 시 캐시된 데이터 반환
      const cached = cache.get();
      if (cached.notices.length > 0) {
        return {
          items: cached.notices.filter(n => !lang || n.lang === lang),
          etag: cached.etag || undefined,
          notModified: true
        };
      }

      throw error;
    }
  }

  /**
   * 특정 공지사항 상세 조회 (공개)
   */
  async getNotice(id: string): Promise<Notice> {
    try {
      const response = await fetch(`${NOTICES_API}/${id}`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('공지사항 상세 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 공지사항 생성 (관리자)
   */
  async createNotice(notice: NoticeCreate): Promise<Notice> {
    if (!this.adminApiKey) {
      throw new Error('관리자 권한이 필요합니다');
    }

    try {
      const response = await fetch(NOTICES_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.adminApiKey
        },
        body: JSON.stringify(notice)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const newNotice = await response.json();

      // 캐시 무효화
      cache.clear();

      return newNotice;
    } catch (error) {
      console.error('공지사항 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 공지사항 수정 (관리자)
   */
  async updateNotice(id: string, notice: NoticeUpdate): Promise<Notice> {
    if (!this.adminApiKey) {
      throw new Error('관리자 권한이 필요합니다');
    }

    try {
      const response = await fetch(`${NOTICES_API}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.adminApiKey
        },
        body: JSON.stringify(notice)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const updatedNotice = await response.json();

      // 캐시 무효화
      cache.clear();

      return updatedNotice;
    } catch (error) {
      console.error('공지사항 수정 실패:', error);
      throw error;
    }
  }

  /**
   * 공지사항 삭제 (관리자)
   */
  async deleteNotice(id: string): Promise<void> {
    if (!this.adminApiKey) {
      throw new Error('관리자 권한이 필요합니다');
    }

    try {
      const response = await fetch(`${NOTICES_API}/${id}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': this.adminApiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 캐시 무효화
      cache.clear();

    } catch (error) {
      console.error('공지사항 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 전체 공지사항 조회 (관리자)
   */
  async getAllNotices(): Promise<Notice[]> {
    if (!this.adminApiKey) {
      throw new Error('관리자 권한이 필요합니다');
    }

    try {
      const response = await fetch(`${NOTICES_API}/admin/all`, {
        headers: {
          'X-API-Key': this.adminApiKey
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('관리자 공지사항 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 공지사항 시스템 상태 확인
   */
  async getHealthStatus(): Promise<any> {
    try {
      const response = await fetch(`${NOTICES_API}/health/status`);
      return await response.json();
    } catch (error) {
      console.error('공지사항 상태 확인 실패:', error);
      return { status: 'error', error: error.message };
    }
  }

  /**
   * 캐시 관리
   */
  clearCache(): void {
    cache.clear();
  }

  getCacheInfo(): { cacheSize: number; isExpired: boolean; lastFetch: number } {
    const cached = cache.get();
    return {
      cacheSize: cached.notices.length,
      isExpired: cache.isExpired(),
      lastFetch: (cache as any).lastFetch
    };
  }
}

// 🌟 싱글톤 인스턴스
export const noticeService = new NoticeService();

// 🎛️ 로컬 스토리지 관리 (배너 숨김 기능)
export class NoticeDisplayManager {
  private static readonly HIDDEN_KEY = 'notice:hidden';
  private static readonly HIDDEN_TTL = 24 * 60 * 60 * 1000; // 24시간

  static getHiddenNotices(): string[] {
    try {
      const stored = localStorage.getItem(this.HIDDEN_KEY);
      if (!stored) return [];

      const data = JSON.parse(stored);
      const now = Date.now();

      // TTL 만료된 항목 제거
      const valid = data.filter((item: any) =>
        item.hiddenAt && (now - item.hiddenAt) < this.HIDDEN_TTL
      );

      // 만료된 항목이 있으면 업데이트
      if (valid.length !== data.length) {
        this.setHiddenNotices(valid.map((item: any) => item.id));
      }

      return valid.map((item: any) => item.id);
    } catch {
      return [];
    }
  }

  static hideNotice(id: string): void {
    const hidden = this.getHiddenNotices();
    if (!hidden.includes(id)) {
      const hiddenData = [
        ...hidden.map(hiddenId => ({ id: hiddenId, hiddenAt: Date.now() })),
        { id, hiddenAt: Date.now() }
      ];

      localStorage.setItem(this.HIDDEN_KEY, JSON.stringify(hiddenData));
    }
  }

  static setHiddenNotices(ids: string[]): void {
    const hiddenData = ids.map(id => ({ id, hiddenAt: Date.now() }));
    localStorage.setItem(this.HIDDEN_KEY, JSON.stringify(hiddenData));
  }

  static clearHiddenNotices(): void {
    localStorage.removeItem(this.HIDDEN_KEY);
  }

  static isNoticeHidden(id: string): boolean {
    return this.getHiddenNotices().includes(id);
  }
}

// 🚀 편의 함수들
export async function getActiveNotices(lang?: string): Promise<Notice[]> {
  const response = await noticeService.fetchNotices({ lang });
  return response.items;
}

export async function getTopNotice(lang?: string): Promise<Notice | null> {
  const notices = await getActiveNotices(lang);
  const hidden = NoticeDisplayManager.getHiddenNotices();

  const visible = notices.filter(notice => !hidden.includes(notice.id));
  return visible.length > 0 ? visible[0] : null;
}

export default noticeService;