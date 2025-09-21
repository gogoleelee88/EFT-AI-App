"""
메모리 통계 시스템 유닛 테스트
간단한 smoke test와 안전성 검증
"""

import pytest
from datetime import datetime
from unittest.mock import Mock, patch
from services.memory_system import get_memory_stats


class FakeTurn:
    """테스트용 가짜 턴 객체"""
    def __init__(self, turn_id="t1", suds_pre=None, suds_post=None, emotion="stress"):
        self.turn_id = turn_id
        self.suds_pre = suds_pre
        self.suds_post = suds_post
        self.emotion_analysis = {"primary_emotion": emotion} if emotion else None
        self.timestamp = datetime(2025, 9, 21, 12, 0, 0)


class FakeMemorySystem:
    """테스트용 가짜 메모리 시스템"""
    def __init__(self, turns=None, summary="hello world"):
        self._summaries_cache = {"test_session": summary}
        self.memory_file = Mock()
        self.memory_file.exists.return_value = False
        self._turns = turns or []

    def get_recent_turns(self, session_id, k=10):
        return self._turns[:k]


def test_get_memory_stats_smoke():
    """기본 동작 테스트 (정상 케이스)"""
    fake_turns = [
        FakeTurn("t1", suds_pre=8, suds_post=4, emotion="stress"),
        FakeTurn("t2", suds_pre=5, emotion="anxiety"),
    ]
    fake_ms = FakeMemorySystem(fake_turns)

    with patch('services.memory_system.get_memory_system', return_value=fake_ms):
        with patch('config.settings.get_settings') as mock_settings:
            mock_settings.return_value.MEMORY_STATS_RECENT_K = 10

            result = get_memory_stats("test_session")

    # 기본 구조 검증
    assert result["session_id"] == "test_session"
    assert result["turns_count"] == 2
    assert result["summary_length"] == 11  # "hello world"
    assert result["memory_file_size"] == 0
    assert isinstance(result["suds_measurements"], list)
    assert isinstance(result["emotion_distribution"], dict)

    # SUDS 측정값 검증
    suds = result["suds_measurements"]
    assert len(suds) == 3  # pre(8), post(4), pre(5)
    assert {"type": "pre", "value": 8, "turn_id": "t1"} in suds
    assert {"type": "post", "value": 4, "turn_id": "t1"} in suds
    assert {"type": "pre", "value": 5, "turn_id": "t2"} in suds

    # 감정 분포 검증
    emotions = result["emotion_distribution"]
    assert emotions.get("stress") == 1
    assert emotions.get("anxiety") == 1


def test_get_memory_stats_empty_session():
    """빈 세션 처리 테스트"""
    fake_ms = FakeMemorySystem(turns=[], summary="")

    with patch('services.memory_system.get_memory_system', return_value=fake_ms):
        with patch('config.settings.get_settings') as mock_settings:
            mock_settings.return_value.MEMORY_STATS_RECENT_K = 10

            result = get_memory_stats("empty_session")

    assert result["turns_count"] == 0
    assert result["summary_length"] == 0
    assert result["suds_measurements"] == []
    assert result["emotion_distribution"] == {}
    assert result["last_turn_time"] is None


def test_get_memory_stats_none_safety():
    """None 값 안전성 테스트"""
    # None 값들을 가진 턴
    fake_turn = FakeTurn("t1", suds_pre=None, suds_post=None, emotion=None)
    fake_turn.emotion_analysis = None
    fake_turn.timestamp = None

    fake_ms = FakeMemorySystem([fake_turn], summary=None)
    fake_ms._summaries_cache = {"test_session": None}

    with patch('services.memory_system.get_memory_system', return_value=fake_ms):
        with patch('config.settings.get_settings') as mock_settings:
            mock_settings.return_value.MEMORY_STATS_RECENT_K = 10

            result = get_memory_stats("test_session")

    # None 값들이 안전하게 처리되었는지 확인
    assert result["turns_count"] == 1
    assert result["summary_length"] == 0  # None → ""
    assert result["suds_measurements"] == []  # None SUDS 값들은 제외
    assert result["emotion_distribution"] == {}  # None 감정은 제외
    assert result["last_turn_time"] is None  # None timestamp 처리


def test_get_memory_stats_file_access_error():
    """파일 접근 오류 처리 테스트"""
    fake_ms = FakeMemorySystem()
    fake_ms.memory_file.exists.side_effect = Exception("File access error")

    with patch('services.memory_system.get_memory_system', return_value=fake_ms):
        with patch('config.settings.get_settings') as mock_settings:
            mock_settings.return_value.MEMORY_STATS_RECENT_K = 10

            result = get_memory_stats("test_session")

    # 파일 접근 오류 시 기본값 반환 확인
    assert result["memory_file_size"] == 0


def test_get_memory_stats_malformed_data():
    """손상된 데이터 처리 테스트"""
    # 잘못된 감정 분석 데이터
    fake_turn = FakeTurn("t1")
    fake_turn.emotion_analysis = "not_a_dict"  # dict가 아닌 값

    fake_ms = FakeMemorySystem([fake_turn])

    with patch('services.memory_system.get_memory_system', return_value=fake_ms):
        with patch('config.settings.get_settings') as mock_settings:
            mock_settings.return_value.MEMORY_STATS_RECENT_K = 10

            result = get_memory_stats("test_session")

    # 잘못된 데이터는 무시되고 정상 처리되어야 함
    assert result["emotion_distribution"] == {}


if __name__ == "__main__":
    # 간단한 실행
    test_get_memory_stats_smoke()
    test_get_memory_stats_empty_session()
    test_get_memory_stats_none_safety()
    print("✅ 모든 테스트 통과!")