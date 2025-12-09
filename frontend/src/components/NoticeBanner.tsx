/**
 * 공지사항 배너 컴포넌트
 * 앱 상단에 표시되는 공지사항 배너
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  type Notice,
  noticeService,
  NoticeDisplayManager,
  getSeverityColor,
  getSeverityIcon,
  formatNoticeDate,
  getCurrentLanguage
} from '../services/noticeService';

interface NoticeBannerProps {
  /**
   * 배너 표시 위치
   * - 'top': 페이지 상단 고정
   * - 'inline': 인라인으로 표시
   */
  position?: 'top' | 'inline';

  /**
   * 최대 표시할 공지사항 수
   */
  maxNotices?: number;

  /**
   * 자동 새로고침 간격 (밀리초)
   */
  refreshInterval?: number;

  /**
   * 클릭 시 상세 페이지로 이동할지 여부
   */
  linkToDetail?: boolean;

  /**
   * 클래스명 추가
   */
  className?: string;

  /**
   * 공지사항 클릭 핸들러
   */
  onNoticeClick?: (notice: Notice) => void;
}

export default function NoticeBanner({
  position = 'top',
  maxNotices = 1,
  refreshInterval = 5 * 60 * 1000, // 5분
  linkToDetail = false,
  className = '',
  onNoticeClick
}: NoticeBannerProps) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [hiddenNotices, setHiddenNotices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // 공지사항 로드
  const loadNotices = useCallback(async () => {
    try {
      setError(null);
      const lang = getCurrentLanguage();
      const response = await noticeService.fetchNotices({ lang });

      if (!response.notModified) {
        setNotices(response.items);
      }
    } catch (err) {
      console.error('공지사항 로드 실패:', err);
      setError(err instanceof Error ? err.message : '공지사항을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  // 숨김 목록 로드
  const loadHiddenNotices = useCallback(() => {
    const hidden = NoticeDisplayManager.getHiddenNotices();
    setHiddenNotices(hidden);
  }, []);

  // 공지사항 숨기기
  const hideNotice = useCallback((noticeId: string) => {
    NoticeDisplayManager.hideNotice(noticeId);
    setHiddenNotices(prev => [...prev, noticeId]);
  }, []);

  // 공지사항 클릭 처리
  const handleNoticeClick = useCallback((notice: Notice) => {
    if (onNoticeClick) {
      onNoticeClick(notice);
    } else if (linkToDetail) {
      // 라우터가 있다면 상세 페이지로 이동
      // window.location.href = `/notices/${notice.id}`;
      console.log('공지사항 상세 이동:', notice.id);
    }
  }, [onNoticeClick, linkToDetail]);

  // 초기 로드 및 자동 새로고침
  useEffect(() => {
    loadNotices();
    loadHiddenNotices();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        loadNotices();
        loadHiddenNotices();
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [loadNotices, loadHiddenNotices, refreshInterval]);

  // 표시할 공지사항 필터링
  const visibleNotices = notices
    .filter(notice => !hiddenNotices.includes(notice.id))
    .slice(0, maxNotices);

  // 로딩 상태
  if (loading) {
    return (
      <div className={`animate-pulse bg-gray-100 h-12 ${position === 'top' ? 'w-full' : ''} ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-sm text-gray-500">공지사항 로드 중...</div>
        </div>
      </div>
    );
  }

  // 에러 상태 (개발 모드에서만 표시)
  if (error && process.env.NODE_ENV === 'development') {
    return (
      <div className={`bg-red-50 border border-red-200 text-red-700 px-4 py-2 text-sm ${className}`}>
        공지사항 로드 실패: {error}
      </div>
    );
  }

  // 표시할 공지사항이 없으면 숨김
  if (visibleNotices.length === 0) {
    return null;
  }

  // 단일 공지사항 렌더링
  const renderSingleNotice = (notice: Notice) => {
    const colorClass = getSeverityColor(notice.severity);
    const icon = getSeverityIcon(notice.severity);

    return (
      <div
        key={notice.id}
        className={`${colorClass} border px-4 py-3 flex items-start gap-3 ${
          position === 'top' ? 'w-full' : ''
        } ${className}`}
      >
        {/* 아이콘 */}
        <div className="flex-shrink-0 text-lg">
          {icon}
        </div>

        {/* 메인 콘텐츠 */}
        <div className="flex-grow min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-grow min-w-0">
              {/* 제목 */}
              <h3
                className={`font-semibold text-sm mb-1 ${
                  linkToDetail || onNoticeClick ? 'cursor-pointer hover:underline' : ''
                }`}
                onClick={() => handleNoticeClick(notice)}
              >
                {notice.pinned && (
                  <span className="inline-flex items-center mr-2">
                    📌
                  </span>
                )}
                {notice.title}
              </h3>

              {/* 본문 (간략하게) */}
              <div
                className="text-xs opacity-80 line-clamp-2"
                dangerouslySetInnerHTML={{
                  __html: notice.body.length > 100
                    ? notice.body.substring(0, 100) + '...'
                    : notice.body
                }}
              />

              {/* 시간 */}
              <div className="text-xs opacity-60 mt-1">
                {formatNoticeDate(notice.updatedAt)}
              </div>
            </div>

            {/* 액션 버튼들 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 더보기 버튼 (본문이 긴 경우) */}
              {notice.body.length > 100 && (
                <button
                  className="text-xs underline opacity-70 hover:opacity-100"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? '접기' : '더보기'}
                </button>
              )}

              {/* 숨기기 버튼 */}
              <button
                className="text-xs underline opacity-70 hover:opacity-100"
                onClick={() => hideNotice(notice.id)}
                title="오늘 하루 숨기기"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 확장된 본문 */}
          {isExpanded && notice.body.length > 100 && (
            <div
              className="text-xs opacity-80 mt-2 pt-2 border-t border-current border-opacity-20"
              dangerouslySetInnerHTML={{ __html: notice.body }}
            />
          )}
        </div>
      </div>
    );
  };

  // 여러 공지사항 렌더링
  const renderMultipleNotices = () => {
    return (
      <div className={`space-y-2 ${className}`}>
        {visibleNotices.map(renderSingleNotice)}
      </div>
    );
  };

  // position에 따른 스타일 적용
  const positionClass = position === 'top'
    ? 'fixed top-0 left-0 right-0 z-50 shadow-sm'
    : '';

  return (
    <div className={positionClass}>
      {maxNotices === 1 ? renderSingleNotice(visibleNotices[0]) : renderMultipleNotices()}
    </div>
  );
}

// 📱 편의 컴포넌트들

/**
 * 상단 고정 배너 (기본)
 */
export function TopNoticeBanner(props: Omit<NoticeBannerProps, 'position'>) {
  return <NoticeBanner {...props} position="top" />;
}

/**
 * 인라인 배너
 */
export function InlineNoticeBanner(props: Omit<NoticeBannerProps, 'position'>) {
  return <NoticeBanner {...props} position="inline" />;
}

/**
 * 긴급 공지 모달 (critical severity 전용)
 */
interface CriticalNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  notice: Notice;
}

export function CriticalNoticeModal({ isOpen, onClose, notice }: CriticalNoticeModalProps) {
  if (!isOpen || notice.severity !== 'critical') {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="text-2xl">🚨</div>
          <div className="flex-grow">
            <h2 className="font-bold text-lg text-red-800 mb-2">
              긴급 공지
            </h2>
            <h3 className="font-semibold text-red-700 mb-3">
              {notice.title}
            </h3>
            <div
              className="text-sm text-red-600"
              dangerouslySetInnerHTML={{ __html: notice.body }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={onClose}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// 🎣 커스텀 훅

/**
 * 공지사항 상태 관리 훅
 */
export function useNotices(options: {
  lang?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
} = {}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const response = await noticeService.fetchNotices(options);
      if (!response.notModified) {
        setNotices(response.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '공지사항 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [options]);

  useEffect(() => {
    refresh();

    if (options.autoRefresh) {
      const interval = setInterval(refresh, options.refreshInterval || 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [refresh, options.autoRefresh, options.refreshInterval]);

  return {
    notices,
    loading,
    error,
    refresh
  };
}