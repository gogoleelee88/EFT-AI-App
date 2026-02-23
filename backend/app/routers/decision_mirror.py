from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.app.schemas.decision_mirror import (
    DecisionMirrorCallRequest,
    DecisionMirrorCallResponse,
    DecisionMirrorMessagesRequest,
    DecisionMirrorMessagesResponse,
    DecisionMirrorProfileRequest,
    DecisionMirrorProfileResponse,
    DecisionMirrorScoreRequest,
    DecisionMirrorScoreResponse,
)
from backend.app.services.auth_helpers import get_current_user
from backend.app.services.decision_mirror_engine import DecisionMirrorEngine
from backend.models.user import User


router = APIRouter(tags=["decision-mirror"])
engine = DecisionMirrorEngine()


@router.post("/api/decision-mirror/profile", response_model=DecisionMirrorProfileResponse)
def post_decision_mirror_profile(
    body: DecisionMirrorProfileRequest,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    return engine.build_profile(context=body)


@router.post("/api/decision-mirror/messages", response_model=DecisionMirrorMessagesResponse)
def post_decision_mirror_messages(
    body: DecisionMirrorMessagesRequest,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    return engine.build_messages(
        context=body.context,
        goal=body.goal,
        constraints=body.constraints,
        question_attachments_text=body.question_attachments_text,
    )


@router.post("/api/decision-mirror/score", response_model=DecisionMirrorScoreResponse)
def post_decision_mirror_score(
    body: DecisionMirrorScoreRequest,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    return engine.score_message(
        profile=body.profile,
        message=body.message,
        goal=body.goal,
        constraints=body.constraints,
    )


@router.post("/api/decision-mirror/call", response_model=DecisionMirrorCallResponse)
def post_decision_mirror_call(
    body: DecisionMirrorCallRequest,
    current_user: User = Depends(get_current_user),
):
    _ = current_user
    transcript = [item.model_dump() for item in body.transcript]
    return engine.call_next(
        profile=body.profile,
        call_goal=body.call_goal,
        my_key_points=body.my_key_points,
        difficulty=body.difficulty,
        transcript=transcript,
    )


