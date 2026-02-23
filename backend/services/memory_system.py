"""
ë©ëª¨ë¦??ì¤??v1: ???ì»¨í?¤í¸ êµ¬ì¶ ë°?ê´ë¦?ìµê·¼ k??+ running_summaryë¥??¨ì¨?ì¼ë¡?ê´ë¦¬í???ì¤??"""

from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone
from pathlib import Path
import json
import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class MemoryType(str, Enum):
    """ë©ëª¨ë¦????""
    CONVERSATION = "conversation"    # ????´ì©
    SUDS_MEASUREMENT = "suds"       # SUDS ì¸¡ìê°?    EFT_SESSION = "eft_session"     # EFT ?¸ì ê¸°ë¡
    EMOTION_ANALYSIS = "emotion"    # ê°ì ë¶ì ê²°ê³¼
    ACTION_TOKEN = "action_token"   # ?¡ì ?í° ?¤í

@dataclass
class MemoryEntry:
    """ë©ëª¨ë¦??í¸ë¦?""
    session_id: str
    user_id: Optional[str]
    timestamp: str
    memory_type: MemoryType
    content: Dict[str, Any]
    turn_id: Optional[str] = None
    importance_score: float = 0.5  # 0-1, ì¤ì??
@dataclass
class ConversationTurn:
    """?????""
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
    """ë©ëª¨ë¦??ì¤??v1"""

    def __init__(self, data_dir: Path, max_turns_per_session: int = 20):
        self.data_dir = data_dir
        self.max_turns = max_turns_per_session
        self.memory_file = data_dir / "conversation_memory.jsonl"
        self.summary_file = data_dir / "running_summaries.json"

        # ?ë?ë¦¬ ?ì±
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # ?¸ë©ëª¨ë¦¬ ìºì (ìµê·¼ ?¸ì??
        self._session_cache: Dict[str, List[ConversationTurn]] = {}
        self._summaries_cache: Dict[str, str] = {}

        # ì´ê¸°????ê¸°ì¡´ ?°ì´??ë¡ë
        self._load_recent_sessions()

    def _load_recent_sessions(self):
        """ìµê·¼ ?¸ì?¤ì ë©ëª¨ë¦¬ì ë¡ë"""
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
                            logger.warning(f"ë©ëª¨ë¦?ë¡ë ?¤ë¥: {e}")
                            continue

            # ?ì½ ìºì ë¡ë
            if self.summary_file.exists():
                with open(self.summary_file, 'r', encoding='utf-8') as f:
                    self._summaries_cache = json.load(f)

        except Exception as e:
            logger.error(f"ë©ëª¨ë¦??ì¤??ì´ê¸°???¤ë¥: {e}")

    def save_conversation_turn(self, turn: ConversationTurn):
        """????????""
        try:
            # ë©ëª¨ë¦?ìºì ?ë°?´í¸
            if turn.session_id not in self._session_cache:
                self._session_cache[turn.session_id] = []

            # ê¸°ì¡´ ???ë°?´í¸ ?ë ????ì¶ê?
            existing_turn_idx = next(
                (i for i, t in enumerate(self._session_cache[turn.session_id])
                 if t.turn_id == turn.turn_id),
                None
            )

            if existing_turn_idx is not None:
                self._session_cache[turn.session_id][existing_turn_idx] = turn
            else:
                self._session_cache[turn.session_id].append(turn)

            # ìµë? ?????í
            if len(self._session_cache[turn.session_id]) > self.max_turns:
                self._session_cache[turn.session_id] = self._session_cache[turn.session_id][-self.max_turns:]

            # ?ì¼?????            memory_entry = MemoryEntry(
                session_id=turn.session_id,
                user_id=None,  # ì¶í user_id ì¶ê? ê°??                timestamp=turn.timestamp,
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
            logger.info(f"?????????ë£: {turn.session_id}/{turn.turn_id}")

        except Exception as e:
            logger.error(f"?????????¤ë¥: {e}")

    def _append_memory_entry(self, entry: MemoryEntry):
        """ë©ëª¨ë¦??í¸ë¦¬ë? ?ì¼??ì¶ê?"""
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
            logger.error(f"ë©ëª¨ë¦??í¸ë¦?ì¶ê? ?¤ë¥: {e}")

    def get_recent_turns(self, session_id: str, k: int = 5) -> List[ConversationTurn]:
        """ìµê·¼ kê°???ì¡°í"""
        if session_id not in self._session_cache:
            return []

        # ìµê·¼ kê°?ë°í (?ê°??
        recent_turns = sorted(
            self._session_cache[session_id],
            key=lambda t: t.timestamp
        )[-k:]

        return recent_turns

    def update_running_summary(self, session_id: str, new_summary: str = None) -> str:
        """?¬ë ?ë¨¸ë¦??ë°?´í¸"""
        try:
            if new_summary:
                # ì§ì ?ê³µ???ì½ ?¬ì©
                self._summaries_cache[session_id] = new_summary
            else:
                # ?ë ?ì½ ?ì±
                recent_turns = self.get_recent_turns(session_id, k=10)
                if not recent_turns:
                    return ""

                # ê°ë¨???ì½ ?ì± (ì¶í LLM ê¸°ë°?¼ë¡ ?ì¥ ê°??
                summary_parts = []

                # ì£¼ì ê°ì ?¨í´
                emotions = [t.emotion_analysis.get('primary_emotion')
                           for t in recent_turns
                           if t.emotion_analysis and t.emotion_analysis.get('primary_emotion')]
                if emotions:
                    dominant_emotion = max(set(emotions), key=emotions.count)
                    summary_parts.append(f"ì£¼ì ê°ì: {dominant_emotion}")

                # SUDS ë³??                suds_values = [(t.suds_pre, t.suds_post) for t in recent_turns
                              if t.suds_pre is not None or t.suds_post is not None]
                if suds_values:
                    latest_suds = [s for s in suds_values[-1] if s is not None]
                    if latest_suds:
                        summary_parts.append(f"ìµê·¼ SUDS: {latest_suds[-1]}")

                # ?¡ì ?¤í ?¨í´
                action_types = []
                for turn in recent_turns:
                    for action in turn.actions_executed:
                        if action.get('result', {}).get('action'):
                            action_types.append(action['result']['action'])

                if action_types:
                    common_actions = list(set(action_types))
                    summary_parts.append(f"ì£¼ì ?ë: {', '.join(common_actions[:3])}")

                # ???ì£¼ì (?¤ì??ê¸°ë° ê°ë¨ ë¶ì)
                all_messages = ' '.join([t.user_message for t in recent_turns])
                if len(all_messages) > 50:
                    # ê°ë¨???¤ì??ì¶ì¶ (ì¶í ê°ì ê°??
                    summary_parts.append(f"????´ì©: {len(recent_turns)}??ì§í")

                generated_summary = " | ".join(summary_parts) if summary_parts else "???¸ì"
                self._summaries_cache[session_id] = generated_summary

            # ?ì¼?????            self._save_summaries()

            return self._summaries_cache.get(session_id, "")

        except Exception as e:
            logger.error(f"?¬ë ?ë¨¸ë¦??ë°?´í¸ ?¤ë¥: {e}")
            return self._summaries_cache.get(session_id, "")

    def _save_summaries(self):
        """?ì½?¤ì ?ì¼?????""
        try:
            with open(self.summary_file, 'w', encoding='utf-8') as f:
                json.dump(self._summaries_cache, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"?ì½ ????¤ë¥: {e}")

    def build_context(self, session_id: str, user_id: Optional[str] = None,
                     k_recent_turns: int = 5) -> Dict[str, Any]:
        """???ì»¨í?¤í¸ êµ¬ì¶ (?µì¬ ?¨ì!)"""
        try:
            # 1. ìµê·¼ k??ì¡°í
            recent_turns = self.get_recent_turns(session_id, k=k_recent_turns)

            # 2. ?¬ë ?ë¨¸ë¦?ì¡°í
            running_summary = self._summaries_cache.get(session_id, "")

            # 3. ì»¨í?¤í¸ êµ¬ì¡°??            context = {
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

            logger.info(f"ì»¨í?¤í¸ êµ¬ì¶ ?ë£: {session_id} ({len(recent_turns)}?? ?ì½: {'?ì' if running_summary else '?ì'})")
            return context

        except Exception as e:
            logger.error(f"ì»¨í?¤í¸ êµ¬ì¶ ?¤ë¥: {e}")
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
        """SUDS ì¸¡ìê°?ê¸°ë¡"""
        try:
            # ?´ë¹ ?´ì ì°¾ì??SUDS ê°??ë°?´í¸
            if session_id in self._session_cache:
                for turn in self._session_cache[session_id]:
                    if turn.turn_id == turn_id:
                        if measurement_type == "pre":
                            turn.suds_pre = suds_value
                        elif measurement_type == "post":
                            turn.suds_post = suds_value

                        # ë³ê²½ë ?????                        self.save_conversation_turn(turn)
                        logger.info(f"SUDS ê¸°ë¡ ?ë£: {session_id}/{turn_id} {measurement_type}={suds_value}")
                        return

            logger.warning(f"SUDS ê¸°ë¡ ?¤í¨: ?´ì ì°¾ì ???ì {session_id}/{turn_id}")

        except Exception as e:
            logger.error(f"SUDS ê¸°ë¡ ?¤ë¥: {e}")

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """?¸ì ?µê³ ì¡°í"""
        try:
            turns = self._session_cache.get(session_id, [])
            if not turns:
                return {"session_id": session_id, "total_turns": 0}

            # ê°ì ë¶í¬
            emotions = [t.emotion_analysis.get('primary_emotion')
                       for t in turns
                       if t.emotion_analysis and t.emotion_analysis.get('primary_emotion')]
            emotion_counts = {}
            for emotion in emotions:
                emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

            # SUDS ë³??            suds_measurements = []
            for turn in turns:
                if turn.suds_pre is not None:
                    suds_measurements.append(("pre", turn.suds_pre))
                if turn.suds_post is not None:
                    suds_measurements.append(("post", turn.suds_post))

            # ?¡ì ?¤í ?µê³
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
            logger.error(f"?¸ì ?µê³ ì¡°í ?¤ë¥: {e}")
            return {"session_id": session_id, "error": str(e)}

# ?ì ë©ëª¨ë¦??ì¤???¸ì¤?´ì¤ (?±ê????¨í´)
_memory_system_instance: Optional[MemorySystem] = None

def get_memory_system(data_dir: Path = None) -> MemorySystem:
    """ë©ëª¨ë¦??ì¤???±ê????¸ì¤?´ì¤ ë°í"""
    global _memory_system_instance

    if _memory_system_instance is None:
        if data_dir is None:
            # ê¸°ë³¸ ?°ì´???ë?ë¦¬
            data_dir = Path(__file__).resolve().parent.parent / "data"
        _memory_system_instance = MemorySystem(data_dir)

    return _memory_system_instance

# ?¸ì ?¨ì??def build_context(session_id: str, user_id: Optional[str] = None, k: int = 5) -> Dict[str, Any]:
    """ë©ëª¨ë¦??ì¤?ì build_context ?í¼"""
    return get_memory_system().build_context(session_id, user_id, k)

def update_running_summary(session_id: str) -> str:
    """?¬ë ?ë¨¸ë¦??ë°?´í¸ ?í¼"""
    return get_memory_system().update_running_summary(session_id)

def save_turn(session_id: str, turn_id: str, user_message: str, ai_response: str,
              emotion_analysis: Dict[str, Any] = None, actions: List[Dict[str, Any]] = None):
    """?????????¸ì ?¨ì"""
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
    """datetime ??ISO8601 Z ì§ë¬?? ë³??ë¶ê? ??None."""
    if isinstance(dt, datetime):
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    elif isinstance(dt, str):
        return dt  # ?´ë? ë¬¸ì?´ì´ë©?ê·¸ë?ë¡?ë°í
    return None

def _safe_summary_preview(text: Optional[str], n: int = 100) -> str:
    """?ì???ì¤??ë¯¸ë¦¬ë³´ê¸° ?ì±"""
    s = text or ""
    return (s[:n] + "...") if len(s) > n else s

def get_memory_stats(session_id: str) -> Dict[str, Any]:
    """ë©ëª¨ë¦??ì¤???í ì¡°í (?ë²ê¹ì©) - ?ì??ê°í ë²ì"""
    from config.settings import get_settings
    settings = get_settings()

    ms = get_memory_system()

    # ìµê·¼ ??ê°?¸ì¤ê¸?(?¤ìê°??¬ì© + ?ì ê°??
    recent_turns: List[Any] = ms.get_recent_turns(session_id, k=settings.MEMORY_STATS_RECENT_K) or []

    # summary ?ì ?ê·¼ (_summaries_cache???´ë? êµ¬í?´ë?ë¡?getattr ê°??
    summary: Optional[str] = None
    summaries_cache = getattr(ms, "_summaries_cache", None)
    if isinstance(summaries_cache, dict):
        summary = summaries_cache.get(session_id)  # ?ì¼ë©?None

    # SUDS/ê°ì ë¶í¬ ì§ê³
    suds_measurements: List[Dict[str, Any]] = []
    emotion_distribution: Dict[str, int] = {}

    for turn in recent_turns:
        # SUDS ?ì ?ê·¼
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

        # ê°ì ë¶í¬ ?ì ì§ê³
        ea = getattr(turn, "emotion_analysis", None) or {}
        emotion = ea.get("primary_emotion") if isinstance(ea, dict) else None
        if isinstance(emotion, str) and emotion:
            emotion_distribution[emotion] = emotion_distribution.get(emotion, 0) + 1

    # ë©ëª¨ë¦??ì¼ ?¬ì´ì¦?(?ì ê°??
    mem_file_size = 0
    mem_file = getattr(ms, "memory_file", None)
    try:
        if mem_file and hasattr(mem_file, "exists") and mem_file.exists():
            mem_file_size = mem_file.stat().st_size
    except Exception:
        mem_file_size = 0  # ?ì¼ ?ê·¼ ?¤í¨ ??0?¼ë¡

    # ë§ì?ë§????ê° ISO8601 (?ì ë³??
    last_ts = None
    if recent_turns:
        last_ts = _to_iso_utc(getattr(recent_turns[-1], "timestamp", None))

    # summary ê¸¸ì´/ë¯¸ë¦¬ë³´ê¸° (None ë°©ì´)
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
