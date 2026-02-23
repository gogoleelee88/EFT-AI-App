from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend.spec_loop.behavior.schemas import (
    ActivityCandidateIn,
    ClarificationAnswerIn,
    ClarificationQuestionCreateIn,
    TimelineSegmentPatchIn,
)
from backend.spec_loop.behavior.service import (
    answer_question,
    create_question_if_needed,
    create_question_from_candidate,
    dismiss_question,
    expire_overdue_questions,
    ingest_candidate,
    list_pending_questions,
    list_timeline_segments,
    patch_timeline_segment_label,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def test_behavior_candidate_question_answer_patch_flow(db_session):
    start = _now() - timedelta(minutes=3)
    end = _now() - timedelta(minutes=2)
    candidate_in = ActivityCandidateIn(
        user_id="u1",
        day_id=None,
        ts_start=start,
        ts_end=end,
        top1="STILL+SCREEN_ON",
        activity_topk=[{"label": "STILL+SCREEN_ON", "score": 0.61}],
        confidence=0.61,
        margin_top1_top2=0.08,
        mismatch_score=0.73,
        trigger_reasons=["low_confidence", "schedule_mismatch"],
    )
    candidate, dedupe_hit = ingest_candidate(db_session, candidate_in)
    assert dedupe_hit is False
    assert candidate.candidate_id > 0

    question_in = ClarificationQuestionCreateIn(
        user_id="u1",
        candidate_id=candidate.candidate_id,
        trigger_reasons=["low_confidence"],
        cooldown_minutes=20,
    )
    question, cooldown_skipped = create_question_if_needed(db_session, question_in)
    assert cooldown_skipped is False
    assert question.status == "asked"

    question_dup, cooldown_skipped_dup = create_question_if_needed(db_session, question_in)
    assert cooldown_skipped_dup is True
    assert question_dup.question_id == question.question_id

    answer_in = ClarificationAnswerIn(user_id="u1", label="work", note="focus block")
    question_row, label_row, segment = answer_question(db_session, question.question_id, answer_in)
    assert question_row.status == "answered"
    assert label_row.user_label == "work"
    assert segment.final_label == "work"

    rows = list_timeline_segments(db_session, user_id="u1")
    assert len(rows) >= 1

    patch_in = TimelineSegmentPatchIn(user_id="u1", final_label="rest", note="manual correction")
    patched = patch_timeline_segment_label(db_session, segment.segment_id, patch_in)
    assert patched.final_label == "rest"
    assert patched.label_source == "manual_edit"


def test_behavior_question_expire_and_dismiss(db_session):
    now = _now()
    candidate_in = ActivityCandidateIn(
        user_id="u2",
        ts_start=now - timedelta(minutes=4),
        ts_end=now - timedelta(minutes=3),
        top1="STILL+NO_MOTION",
        confidence=0.51,
    )
    candidate, _ = ingest_candidate(db_session, candidate_in)
    question_in = ClarificationQuestionCreateIn(
        user_id="u2",
        candidate_id=candidate.candidate_id,
        expires_minutes=1,
    )
    question, _ = create_question_if_needed(db_session, question_in)
    question.expires_at = now - timedelta(seconds=1)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        answer_question(db_session, question.question_id, ClarificationAnswerIn(user_id="u2", label="rest"))
    assert exc.value.status_code == 409

    question2_in = ClarificationQuestionCreateIn(user_id="u2", candidate_id=candidate.candidate_id)
    question2, _ = create_question_if_needed(db_session, question2_in)
    dismissed = dismiss_question(db_session, question2.question_id, user_id="u2")
    assert dismissed.status == "dismissed"

    question3_in = ClarificationQuestionCreateIn(user_id="u2", candidate_id=candidate.candidate_id, expires_minutes=1)
    question3, _ = create_question_if_needed(db_session, question3_in)
    question3.expires_at = now - timedelta(seconds=1)
    db_session.commit()
    expired_count = expire_overdue_questions(db_session, user_id="u2", limit=10)
    assert expired_count >= 1


def test_behavior_auto_question_and_pending(db_session):
    now = _now()
    candidate_in = ActivityCandidateIn(
        user_id="u3",
        ts_start=now - timedelta(minutes=5),
        ts_end=now - timedelta(minutes=4),
        top1="STILL+SCREEN_ON",
        confidence=0.50,
        margin_top1_top2=0.05,
        mismatch_score=0.80,
    )
    candidate, _ = ingest_candidate(db_session, candidate_in)
    question, cooldown_skipped = create_question_from_candidate(db_session, candidate, user_id="u3")
    assert question is not None
    assert cooldown_skipped is False

    rows = list_pending_questions(db_session, user_id="u3", limit=10)
    assert len(rows) >= 1
    assert rows[0].status == "asked"


def test_behavior_ingest_creates_inferred_timeline_and_dedupe_stable(db_session):
    now = _now()
    candidate_in = ActivityCandidateIn(
        user_id="u5",
        ts_start=now - timedelta(minutes=2),
        ts_end=now - timedelta(minutes=1),
        top1="walk",
        confidence=0.73,
        margin_top1_top2=0.21,
        mismatch_score=0.22,
    )
    candidate, dedupe_hit = ingest_candidate(db_session, candidate_in)
    assert dedupe_hit is False

    rows1 = list_timeline_segments(db_session, user_id="u5")
    assert len(rows1) == 1
    assert rows1[0].candidate_id == candidate.candidate_id
    assert rows1[0].inferred_label == "walk"
    assert rows1[0].label_source == "inferred"

    _, dedupe_hit2 = ingest_candidate(db_session, candidate_in)
    assert dedupe_hit2 is True

    rows2 = list_timeline_segments(db_session, user_id="u5")
    assert len(rows2) == 1


def test_behavior_daily_cap_and_type_cooldown(db_session):
    now = _now()
    c1, _ = ingest_candidate(
        db_session,
        ActivityCandidateIn(
            user_id="u4",
            ts_start=now - timedelta(minutes=10),
            ts_end=now - timedelta(minutes=9),
            top1="STILL+SCREEN_ON",
            confidence=0.51,
            margin_top1_top2=0.05,
            mismatch_score=0.7,
        ),
    )
    q1, skipped1 = create_question_if_needed(
        db_session,
        ClarificationQuestionCreateIn(
            user_id="u4",
            candidate_id=c1.candidate_id,
            cooldown_minutes=1,  # should be raised to type cooldown (20)
            max_daily_questions=1,
        ),
    )
    assert skipped1 is False
    assert q1.question_id > 0

    # Same type within cooldown should be skipped (returns existing question)
    c2, _ = ingest_candidate(
        db_session,
        ActivityCandidateIn(
            user_id="u4",
            ts_start=now - timedelta(minutes=8),
            ts_end=now - timedelta(minutes=7),
            top1="STILL+SCREEN_ON",
            confidence=0.50,
            margin_top1_top2=0.04,
            mismatch_score=0.71,
        ),
    )
    q2, skipped2 = create_question_if_needed(
        db_session,
        ClarificationQuestionCreateIn(
            user_id="u4",
            candidate_id=c2.candidate_id,
            cooldown_minutes=1,
            max_daily_questions=1,
        ),
    )
    assert skipped2 is True
    assert q2.question_id == q1.question_id

    # Different type but same day should hit daily cap.
    c3, _ = ingest_candidate(
        db_session,
        ActivityCandidateIn(
            user_id="u4",
            ts_start=now - timedelta(minutes=6),
            ts_end=now - timedelta(minutes=5),
            top1="CALL_POSTURE",
            confidence=0.40,
            margin_top1_top2=0.04,
            mismatch_score=0.72,
        ),
    )
    with pytest.raises(HTTPException) as exc:
        create_question_if_needed(
            db_session,
            ClarificationQuestionCreateIn(
                user_id="u4",
                candidate_id=c3.candidate_id,
                max_daily_questions=1,
            ),
        )
    assert exc.value.status_code == 429
