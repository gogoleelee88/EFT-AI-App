# backend/routers/notices.py
"""
공지사항 API 라우터 - MVP to Production
EFT AI 앱용 공지사항 관리 시스템
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Response
from pydantic import BaseModel, Field
from typing import List, Optional
from uuid import uuid4
from datetime import datetime, timezone
import json
import os
import hashlib
import logging

logger = logging.getLogger(__name__)

# 데이터 파일 경로
DATA_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "notices.json")

class Notice(BaseModel):
    """공지사항 모델"""
    id: str
    title: str
    body: str
    lang: str = "ko"
    severity: str = "info"  # info, warning, critical, success
    pinned: bool = False
    startsAt: Optional[str] = None  # ISO8601
    endsAt: Optional[str] = None    # ISO8601
    createdAt: str
    updatedAt: str

class NoticeCreate(BaseModel):
    """공지사항 생성 요청 모델"""
    title: str = Field(..., description="공지사항 제목")
    body: str = Field(..., description="공지사항 본문 (마크다운 지원)")
    lang: str = Field("ko", description="언어 코드 (ko/en)")
    severity: str = Field("info", description="중요도 (info/warning/critical/success)")
    pinned: bool = Field(False, description="상단 고정 여부")
    startsAt: Optional[str] = Field(None, description="노출 시작 시간 (ISO8601)")
    endsAt: Optional[str] = Field(None, description="노출 종료 시간 (ISO8601)")

class NoticeUpdate(BaseModel):
    """공지사항 수정 요청 모델"""
    title: Optional[str] = None
    body: Optional[str] = None
    lang: Optional[str] = None
    severity: Optional[str] = None
    pinned: Optional[bool] = None
    startsAt: Optional[str] = None
    endsAt: Optional[str] = None

router = APIRouter(prefix="/api/notices", tags=["notices"])

def _load_notices() -> List[Notice]:
    """파일에서 공지사항 목록 로드"""
    try:
        if not os.path.exists(DATA_FILE):
            return []

        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return [Notice(**item) for item in data]
    except Exception as e:
        logger.error(f"공지사항 로드 실패: {e}")
        return []

def _save_notices(notices: List[Notice]) -> None:
    """공지사항 목록을 파일에 저장"""
    try:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump([notice.model_dump() for notice in notices], f, ensure_ascii=False, indent=2)
        logger.info(f"공지사항 {len(notices)}개 저장 완료")
    except Exception as e:
        logger.error(f"공지사항 저장 실패: {e}")
        raise HTTPException(500, "공지사항 저장에 실패했습니다")

def _generate_etag(notices: List[Notice]) -> str:
    """공지사항 목록의 ETag 생성 (캐싱용)"""
    content = json.dumps([notice.model_dump() for notice in notices], sort_keys=True)
    hash_value = hashlib.md5(content.encode("utf-8")).hexdigest()
    return f'W/"{hash_value}"'

def _now_iso() -> str:
    """현재 시간을 ISO8601 형식으로 반환"""
    return datetime.now(timezone.utc).isoformat()

def _filter_active_notices(notices: List[Notice]) -> List[Notice]:
    """활성 상태인 공지사항만 필터링"""
    now = datetime.now(timezone.utc)
    active_notices = []

    for notice in notices:
        # 시작 시간 체크
        if notice.startsAt:
            start_time = datetime.fromisoformat(notice.startsAt.replace('Z', '+00:00'))
            if now < start_time:
                continue

        # 종료 시간 체크
        if notice.endsAt:
            end_time = datetime.fromisoformat(notice.endsAt.replace('Z', '+00:00'))
            if now > end_time:
                continue

        active_notices.append(notice)

    # 정렬: 고정 공지 먼저, 그 다음 최신 순
    return sorted(active_notices, key=lambda x: (not x.pinned, x.updatedAt), reverse=True)

def _verify_admin_key(x_api_key: str = Header(...)) -> bool:
    """관리자 API 키 검증 (기존 프리미엄 키 체계 재활용)"""
    # TODO: 실제 환경에서는 환경변수나 DB에서 관리자 키 확인
    # 현재는 플레이스홀더로 모든 키 허용 (개발용)
    if not x_api_key or x_api_key == "<SET_ME>":
        raise HTTPException(401, "관리자 권한이 필요합니다")
    return True

# 🌐 공개 엔드포인트 - 활성 공지사항 목록 조회
@router.get("", response_model=List[Notice])
async def get_notices(
    response: Response,
    lang: Optional[str] = None,
    if_none_match: Optional[str] = Header(None)
):
    """
    활성 공지사항 목록 조회 (공개)
    - ETag 기반 캐싱 지원
    - 언어별 필터링 지원
    - 활성 기간 내 공지만 반환
    """
    try:
        all_notices = _load_notices()
        active_notices = _filter_active_notices(all_notices)

        # 언어 필터링
        if lang:
            active_notices = [n for n in active_notices if n.lang == lang]

        # ETag 생성 및 캐시 확인
        etag = _generate_etag(active_notices)
        response.headers["ETag"] = etag
        response.headers["Cache-Control"] = "public, max-age=300"  # 5분 캐시

        if if_none_match == etag:
            response.status_code = 304
            return []

        logger.info(f"공지사항 목록 조회: {len(active_notices)}개 (언어: {lang or 'all'})")
        return active_notices

    except Exception as e:
        logger.error(f"공지사항 조회 실패: {e}")
        raise HTTPException(500, "공지사항 조회에 실패했습니다")

# 🌐 공개 엔드포인트 - 특정 공지사항 상세 조회
@router.get("/{notice_id}", response_model=Notice)
async def get_notice(notice_id: str):
    """특정 공지사항 상세 조회 (공개)"""
    try:
        notices = _load_notices()
        active_notices = _filter_active_notices(notices)

        for notice in active_notices:
            if notice.id == notice_id:
                logger.info(f"공지사항 상세 조회: {notice_id}")
                return notice

        raise HTTPException(404, "공지사항을 찾을 수 없습니다")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"공지사항 상세 조회 실패: {e}")
        raise HTTPException(500, "공지사항 조회에 실패했습니다")

# 🔒 관리자 엔드포인트 - 공지사항 생성
@router.post("", response_model=Notice)
async def create_notice(
    payload: NoticeCreate,
    _: bool = Depends(_verify_admin_key)
):
    """공지사항 생성 (관리자 전용)"""
    try:
        notices = _load_notices()
        now = _now_iso()

        new_notice = Notice(
            id=str(uuid4()),
            createdAt=now,
            updatedAt=now,
            **payload.model_dump()
        )

        notices.append(new_notice)
        _save_notices(notices)

        logger.info(f"공지사항 생성: {new_notice.title} (ID: {new_notice.id})")
        return new_notice

    except Exception as e:
        logger.error(f"공지사항 생성 실패: {e}")
        raise HTTPException(500, "공지사항 생성에 실패했습니다")

# 🔒 관리자 엔드포인트 - 공지사항 수정
@router.put("/{notice_id}", response_model=Notice)
async def update_notice(
    notice_id: str,
    payload: NoticeUpdate,
    _: bool = Depends(_verify_admin_key)
):
    """공지사항 수정 (관리자 전용)"""
    try:
        notices = _load_notices()

        for i, notice in enumerate(notices):
            if notice.id == notice_id:
                # 수정된 필드만 업데이트
                update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
                update_data["updatedAt"] = _now_iso()

                updated_notice = notice.model_copy(update=update_data)
                notices[i] = updated_notice
                _save_notices(notices)

                logger.info(f"공지사항 수정: {notice_id}")
                return updated_notice

        raise HTTPException(404, "공지사항을 찾을 수 없습니다")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"공지사항 수정 실패: {e}")
        raise HTTPException(500, "공지사항 수정에 실패했습니다")

# 🔒 관리자 엔드포인트 - 공지사항 삭제
@router.delete("/{notice_id}")
async def delete_notice(
    notice_id: str,
    _: bool = Depends(_verify_admin_key)
):
    """공지사항 삭제 (관리자 전용)"""
    try:
        notices = _load_notices()
        original_count = len(notices)

        notices = [n for n in notices if n.id != notice_id]

        if len(notices) == original_count:
            raise HTTPException(404, "공지사항을 찾을 수 없습니다")

        _save_notices(notices)
        logger.info(f"공지사항 삭제: {notice_id}")
        return {"ok": True, "deleted_id": notice_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"공지사항 삭제 실패: {e}")
        raise HTTPException(500, "공지사항 삭제에 실패했습니다")

# 🔒 관리자 엔드포인트 - 전체 공지사항 목록 (비활성 포함)
@router.get("/admin/all", response_model=List[Notice])
async def get_all_notices(
    _: bool = Depends(_verify_admin_key)
):
    """전체 공지사항 목록 조회 (관리자 전용) - 비활성 공지 포함"""
    try:
        notices = _load_notices()
        # 최신 순으로 정렬
        notices.sort(key=lambda x: x.updatedAt, reverse=True)

        logger.info(f"관리자 공지사항 전체 조회: {len(notices)}개")
        return notices

    except Exception as e:
        logger.error(f"관리자 공지사항 조회 실패: {e}")
        raise HTTPException(500, "공지사항 조회에 실패했습니다")

# 📊 상태 확인 엔드포인트
@router.get("/health/status")
async def get_notices_health():
    """공지사항 시스템 상태 확인"""
    try:
        notices = _load_notices()
        active_notices = _filter_active_notices(notices)

        return {
            "status": "healthy",
            "total_notices": len(notices),
            "active_notices": len(active_notices),
            "pinned_notices": len([n for n in active_notices if n.pinned]),
            "data_file_exists": os.path.exists(DATA_FILE),
            "last_check": _now_iso()
        }

    except Exception as e:
        logger.error(f"공지사항 상태 확인 실패: {e}")
        return {
            "status": "error",
            "error": str(e),
            "last_check": _now_iso()
        }