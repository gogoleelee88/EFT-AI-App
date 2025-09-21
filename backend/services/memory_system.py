"""
메모리 시스템 v1: 대화 컨텍스트 구축 및 관리
최근 k턴 + running_summary를 효율적으로 관리하는 시스템
"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
import json
import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class MemoryType(str, Enum):
    """메모리 타입"""
    CONVERSATION = "conversation"    # 대화 내용
    SUDS_MEASUREMENT = "suds"       # SUDS 측정값
    EFT_SESSION = "eft_session"     # EFT 세션 기록
    EMOTION_ANALYSIS = "emotion"    # 감정 분석 결과
    ACTION_TOKEN = "action_token"   # 액션 토큰 실행

@dataclass
class MemoryEntry:
    """메모리 엔트리"""
    session_id: str
    user_id: Optional[str]
    timestamp: str
    memory_type: MemoryType
    content: Dict[str, Any]
    turn_id: Optional[str] = None
    importance_score: float = 0.5  # 0-1, 중요도

@dataclass
class ConversationTurn:
    """대화 턴"""
    turn_id: str
    session_id: str
    user_message: str
    ai_response: str
    emotion_analysis: Optional[Dict[str, Any]] = None
    actions_executed: List[Dict[str, Any]] = None
    timestamp: str = None
    suds_pre: Optional[int] = None
    suds_post: Optional[int] = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now(timezone.utc).isoformat()
        if self.actions_executed is None:
            self.actions_executed = []

class MemorySystem:
    """메모리 시스템 v1"""

    def __init__(self, data_dir: Path, max_turns_per_session: int = 20):
        self.data_dir = data_dir
        self.max_turns = max_turns_per_session
        self.memory_file = data_dir / "conversation_memory.jsonl"
        self.summary_file = data_dir / "running_summaries.json"

        # 디렉토리 생성
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # 인메모리 캐시 (최근 세션들)
        self._session_cache: Dict[str, List[ConversationTurn]] = {}
        self._summaries_cache: Dict[str, str] = {}

        # 초기화 시 기존 데이터 로드
        self._load_recent_sessions()

    def _load_recent_sessions(self):
        """최근 세션들을 메모리에 로드"""
        try:
            if self.memory_file.exists():
                with open(self.memory_file, 'r', encoding='utf-8') as f:
                    for line in f:
                        if not line.strip():
                            continue
                        try:
                            entry = json.loads(line)
                            if entry.get('memory_type') == MemoryType.CONVERSATION:
                                session_id = entry['session_id']
                                turn_data = entry['content']

                                turn = ConversationTurn(
                                    turn_id=turn_data.get('turn_id', 'unknown'),
                                    session_id=session_id,
                                    user_message=turn_data.get('user_message', ''),
                                    ai_response=turn_data.get('ai_response', ''),
                                    emotion_analysis=turn_data.get('emotion_analysis'),
                                    actions_executed=turn_data.get('actions_executed', []),
                                    timestamp=entry['timestamp'],
                                    suds_pre=turn_data.get('suds_pre'),
                                    suds_post=turn_data.get('suds_post')
                                )

                                if session_id not in self._session_cache:
                                    self._session_cache[session_id] = []
                                self._session_cache[session_id].append(turn)
                        except (json.JSONDecodeError, KeyError) as e:
                            logger.warning(f"메모리 로드 오류: {e}")
                            continue

            # 요약 캐시 로드
            if self.summary_file.exists():
                with open(self.summary_file, 'r', encoding='utf-8') as f:
                    self._summaries_cache = json.load(f)

        except Exception as e:
            logger.error(f"메모리 시스템 초기화 오류: {e}")

    def save_conversation_turn(self, turn: ConversationTurn):
        """대화 턴 저장"""
        try:
            # 메모리 캐시 업데이트
            if turn.session_id not in self._session_cache:
                self._session_cache[turn.session_id] = []

            # 기존 턴 업데이트 또는 새 턴 추가
            existing_turn_idx = next(
                (i for i, t in enumerate(self._session_cache[turn.session_id])
                 if t.turn_id == turn.turn_id),
                None
            )

            if existing_turn_idx is not None:
                self._session_cache[turn.session_id][existing_turn_idx] = turn
            else:
                self._session_cache[turn.session_id].append(turn)

            # 최대 턴 수 제한
            if len(self._session_cache[turn.session_id]) > self.max_turns:
                self._session_cache[turn.session_id] = self._session_cache[turn.session_id][-self.max_turns:]

            # 파일에 저장
            memory_entry = MemoryEntry(
                session_id=turn.session_id,
                user_id=None,  # 추후 user_id 추가 가능
                timestamp=turn.timestamp,
                memory_type=MemoryType.CONVERSATION,
                content={
                    'turn_id': turn.turn_id,
                    'user_message': turn.user_message,
                    'ai_response': turn.ai_response,
                    'emotion_analysis': turn.emotion_analysis,
                    'actions_executed': turn.actions_executed,
                    'suds_pre': turn.suds_pre,
                    'suds_post': turn.suds_post
                },
                turn_id=turn.turn_id
            )

            self._append_memory_entry(memory_entry)
            logger.info(f"대화 턴 저장 완료: {turn.session_id}/{turn.turn_id}")

        except Exception as e:
            logger.error(f"대화 턴 저장 오류: {e}")

    def _append_memory_entry(self, entry: MemoryEntry):
        """메모리 엔트리를 파일에 추가"""
        try:
            with open(self.memory_file, 'a', encoding='utf-8') as f:
                json_data = {
                    'session_id': entry.session_id,
                    'user_id': entry.user_id,
                    'timestamp': entry.timestamp,
                    'memory_type': entry.memory_type,
                    'content': entry.content,
                    'turn_id': entry.turn_id,
                    'importance_score': entry.importance_score
                }
                f.write(json.dumps(json_data, ensure_ascii=False) + '\n')
        except Exception as e:
            logger.error(f"메모리 엔트리 추가 오류: {e}")

    def get_recent_turns(self, session_id: str, k: int = 5) -> List[ConversationTurn]:
        """최근 k개 턴 조회"""
        if session_id not in self._session_cache:
            return []

        # 최근 k개 반환 (시간순)
        recent_turns = sorted(
            self._session_cache[session_id],
            key=lambda t: t.timestamp
        )[-k:]

        return recent_turns

    def update_running_summary(self, session_id: str, new_summary: str = None) -> str:
        """러닝 서머리 업데이트"""
        try:
            if new_summary:
                # 직접 제공된 요약 사용
                self._summaries_cache[session_id] = new_summary
            else:
                # 자동 요약 생성
                recent_turns = self.get_recent_turns(session_id, k=10)
                if not recent_turns:
                    return ""

                # 간단한 요약 생성 (추후 LLM 기반으로 확장 가능)
                summary_parts = []

                # 주요 감정 패턴
                emotions = [t.emotion_analysis.get('primary_emotion')
                           for t in recent_turns
                           if t.emotion_analysis and t.emotion_analysis.get('primary_emotion')]
                if emotions:
                    dominant_emotion = max(set(emotions), key=emotions.count)
                    summary_parts.append(f"주요 감정: {dominant_emotion}")

                # SUDS 변화
                suds_values = [(t.suds_pre, t.suds_post) for t in recent_turns
                              if t.suds_pre is not None or t.suds_post is not None]
                if suds_values:
                    latest_suds = [s for s in suds_values[-1] if s is not None]
                    if latest_suds:
                        summary_parts.append(f"최근 SUDS: {latest_suds[-1]}")

                # 액션 실행 패턴
                action_types = []
                for turn in recent_turns:
                    for action in turn.actions_executed:
                        if action.get('result', {}).get('action'):
                            action_types.append(action['result']['action'])

                if action_types:
                    common_actions = list(set(action_types))
                    summary_parts.append(f"주요 활동: {', '.join(common_actions[:3])}")

                # 대화 주제 (키워드 기반 간단 분석)
                all_messages = ' '.join([t.user_message for t in recent_turns])
                if len(all_messages) > 50:
                    # 간단한 키워드 추출 (추후 개선 가능)
                    summary_parts.append(f"대화 내용: {len(recent_turns)}턴 진행")

                generated_summary = " | ".join(summary_parts) if summary_parts else "새 세션"
                self._summaries_cache[session_id] = generated_summary

            # 파일에 저장
            self._save_summaries()

            return self._summaries_cache.get(session_id, "")

        except Exception as e:
            logger.error(f"러닝 서머리 업데이트 오류: {e}")
            return self._summaries_cache.get(session_id, "")

    def _save_summaries(self):
        """요약들을 파일에 저장"""
        try:
            with open(self.summary_file, 'w', encoding='utf-8') as f:
                json.dump(self._summaries_cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"요약 저장 오류: {e}")

    def build_context(self, session_id: str, user_id: Optional[str] = None,
                     k_recent_turns: int = 5) -> Dict[str, Any]:
        """대화 컨텍스트 구축 (핵심 함수!)"""
        try:
            # 1. 최근 k턴 조회
            recent_turns = self.get_recent_turns(session_id, k=k_recent_turns)

            # 2. 러닝 서머리 조회
            running_summary = self._summaries_cache.get(session_id, "")

            # 3. 컨텍스트 구조화
            context = {
                "session_id": session_id,
                "user_id": user_id,
                "running_summary": running_summary,
                "recent_turns": [
                    {
                        "turn_id": turn.turn_id,
                        "user_message": turn.user_message,
                        "ai_response": turn.ai_response,
                        "timestamp": turn.timestamp,
                        "emotion": turn.emotion_analysis.get('primary_emotion') if turn.emotion_analysis else None,
                        "actions_count": len(turn.actions_executed),
                        "suds_pre": turn.suds_pre,
                        "suds_post": turn.suds_post
                    }
                    for turn in recent_turns
                ],
                "context_stats": {
                    "total_turns": len(recent_turns),
                    "has_summary": bool(running_summary),
                    "recent_emotions": [t.emotion_analysis.get('primary_emotion')
                                      for t in recent_turns[-3:]
                                      if t.emotion_analysis and t.emotion_analysis.get('primary_emotion')],
                    "recent_suds": [
                        {"pre": t.suds_pre, "post": t.suds_post}
                        for t in recent_turns[-3:]
                        if t.suds_pre is not None or t.suds_post is not None
                    ]
                }
            }

            logger.info(f"컨텍스트 구축 완료: {session_id} ({len(recent_turns)}턴, 요약: {'있음' if running_summary else '없음'})")
            return context

        except Exception as e:
            logger.error(f"컨텍스트 구축 오류: {e}")
            return {
                "session_id": session_id,
                "user_id": user_id,
                "running_summary": "",
                "recent_turns": [],
                "context_stats": {"total_turns": 0, "has_summary": False, "recent_emotions": [], "recent_suds": []},
                "error": str(e)
            }

    def record_suds_measurement(self, session_id: str, turn_id: str,
                               suds_value: int, measurement_type: str):
        """SUDS 측정값 기록"""
        try:
            # 해당 턴을 찾아서 SUDS 값 업데이트
            if session_id in self._session_cache:
                for turn in self._session_cache[session_id]:
                    if turn.turn_id == turn_id:
                        if measurement_type == "pre":
                            turn.suds_pre = suds_value
                        elif measurement_type == "post":
                            turn.suds_post = suds_value

                        # 변경된 턴 저장
                        self.save_conversation_turn(turn)
                        logger.info(f"SUDS 기록 완료: {session_id}/{turn_id} {measurement_type}={suds_value}")
                        return

            logger.warning(f"SUDS 기록 실패: 턴을 찾을 수 없음 {session_id}/{turn_id}")

        except Exception as e:
            logger.error(f"SUDS 기록 오류: {e}")

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """세션 통계 조회"""
        try:
            turns = self._session_cache.get(session_id, [])
            if not turns:
                return {"session_id": session_id, "total_turns": 0}

            # 감정 분포
            emotions = [t.emotion_analysis.get('primary_emotion')
                       for t in turns
                       if t.emotion_analysis and t.emotion_analysis.get('primary_emotion')]
            emotion_counts = {}
            for emotion in emotions:
                emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

            # SUDS 변화
            suds_measurements = []
            for turn in turns:
                if turn.suds_pre is not None:
                    suds_measurements.append(("pre", turn.suds_pre))
                if turn.suds_post is not None:
                    suds_measurements.append(("post", turn.suds_post))

            # 액션 실행 통계
            action_counts = {}
            for turn in turns:
                for action in turn.actions_executed:
                    action_type = action.get('result', {}).get('action', 'unknown')
                    action_counts[action_type] = action_counts.get(action_type, 0) + 1

            return {
                "session_id": session_id,
                "total_turns": len(turns),
                "emotion_distribution": emotion_counts,
                "suds_measurements": suds_measurements,
                "action_distribution": action_counts,
                "first_turn": turns[0].timestamp if turns else None,
                "last_turn": turns[-1].timestamp if turns else None,
                "running_summary": self._summaries_cache.get(session_id, "")
            }

        except Exception as e:
            logger.error(f"세션 통계 조회 오류: {e}")
            return {"session_id": session_id, "error": str(e)}

# 전역 메모리 시스템 인스턴스 (싱글톤 패턴)
_memory_system_instance: Optional[MemorySystem] = None

def get_memory_system(data_dir: Path = None) -> MemorySystem:
    """메모리 시스템 싱글톤 인스턴스 반환"""
    global _memory_system_instance

    if _memory_system_instance is None:
        if data_dir is None:
            # 기본 데이터 디렉토리
            data_dir = Path(__file__).resolve().parent.parent / "data"
        _memory_system_instance = MemorySystem(data_dir)

    return _memory_system_instance

# 편의 함수들
def build_context(session_id: str, user_id: Optional[str] = None, k: int = 5) -> Dict[str, Any]:
    """메모리 시스템의 build_context 래퍼"""
    return get_memory_system().build_context(session_id, user_id, k)

def update_running_summary(session_id: str) -> str:
    """러닝 서머리 업데이트 래퍼"""
    return get_memory_system().update_running_summary(session_id)

def save_turn(session_id: str, turn_id: str, user_message: str, ai_response: str,
              emotion_analysis: Dict[str, Any] = None, actions: List[Dict[str, Any]] = None):
    """대화 턴 저장 편의 함수"""
    turn = ConversationTurn(
        turn_id=turn_id,
        session_id=session_id,
        user_message=user_message,
        ai_response=ai_response,
        emotion_analysis=emotion_analysis,
        actions_executed=actions or []
    )
    get_memory_system().save_conversation_turn(turn)

def _to_iso_utc(dt: Any) -> Optional[str]:
    """datetime → ISO8601 Z 직렬화. 변환 불가 시 None."""
    if isinstance(dt, datetime):
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    elif isinstance(dt, str):
        return dt  # 이미 문자열이면 그대로 반환
    return None

def _safe_summary_preview(text: Optional[str], n: int = 100) -> str:
    """안전한 텍스트 미리보기 생성"""
    s = text or ""
    return (s[:n] + "...") if len(s) > n else s

def get_memory_stats(session_id: str) -> Dict[str, Any]:
    """메모리 시스템 상태 조회 (디버깅용) - 안전성 강화 버전"""
    from config.settings import get_settings
    settings = get_settings()

    ms = get_memory_system()

    # 최근 턴 가져오기 (설정값 사용 + 안전 가드)
    recent_turns: List[Any] = ms.get_recent_turns(session_id, k=settings.MEMORY_STATS_RECENT_K) or []

    # summary 안전 접근 (_summaries_cache는 내부 구현이므로 getattr 가드)
    summary: Optional[str] = None
    summaries_cache = getattr(ms, "_summaries_cache", None)
    if isinstance(summaries_cache, dict):
        summary = summaries_cache.get(session_id)  # 없으면 None

    # SUDS/감정 분포 집계
    suds_measurements: List[Dict[str, Any]] = []
    emotion_distribution: Dict[str, int] = {}

    for turn in recent_turns:
        # SUDS 안전 접근
        if getattr(turn, "suds_pre", None) is not None:
            suds_measurements.append({
                "type": "pre",
                "value": turn.suds_pre,
                "turn_id": getattr(turn, "turn_id", None),
            })
        if getattr(turn, "suds_post", None) is not None:
            suds_measurements.append({
                "type": "post",
                "value": turn.suds_post,
                "turn_id": getattr(turn, "turn_id", None),
            })

        # 감정 분포 안전 집계
        ea = getattr(turn, "emotion_analysis", None) or {}
        emotion = ea.get("primary_emotion") if isinstance(ea, dict) else None
        if isinstance(emotion, str) and emotion:
            emotion_distribution[emotion] = emotion_distribution.get(emotion, 0) + 1

    # 메모리 파일 사이즈 (안전 가드)
    mem_file_size = 0
    mem_file = getattr(ms, "memory_file", None)
    try:
        if mem_file and hasattr(mem_file, "exists") and mem_file.exists():
            mem_file_size = mem_file.stat().st_size
    except Exception:
        mem_file_size = 0  # 파일 접근 실패 시 0으로

    # 마지막 턴 시간 ISO8601 (안전 변환)
    last_ts = None
    if recent_turns:
        last_ts = _to_iso_utc(getattr(recent_turns[-1], "timestamp", None))

    # summary 길이/미리보기 (None 방어)
    summary_text = summary or ""
    summary_len = len(summary_text)

    return {
        "session_id": session_id,
        "turns_count": len(recent_turns),
        "summary_length": summary_len,
        "memory_file_size": mem_file_size,
        "last_turn_time": last_ts,
        "suds_measurements": suds_measurements,
        "emotion_distribution": emotion_distribution,
        "summary_preview": _safe_summary_preview(summary_text, 100),
    }