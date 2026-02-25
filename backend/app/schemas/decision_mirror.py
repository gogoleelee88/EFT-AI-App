from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


DecisionStyle = Literal["logical", "emotional", "mixed"]
ToneStyle = Literal["short_direct", "formal_polite", "warm"]
Difficulty = Literal["easy", "normal", "hard"]
Speaker = Literal["me", "them"]


class DecisionMirrorContext(BaseModel):
    email_thread_text: str = ""
    chat_log_text: str = ""
    attachments_text: Optional[str] = None


class DecisionMirrorProfile(BaseModel):
    decision_style: DecisionStyle
    risk_aversion: int = Field(..., ge=0, le=10)
    approval_speed: int = Field(..., ge=0, le=10)
    price_sensitivity: int = Field(..., ge=0, le=10)
    pushback_intensity: int = Field(..., ge=0, le=10)
    common_objections: list[str]
    approval_triggers: list[str]
    tone_style: ToneStyle
    rejection_patterns: list[str]


class DecisionMirrorEvidence(BaseModel):
    quotes: list[str]


class DecisionMirrorProfileRequest(DecisionMirrorContext):
    pass


class DecisionMirrorProfileResponse(BaseModel):
    profile: DecisionMirrorProfile
    evidence: DecisionMirrorEvidence


class DecisionSuggestion(BaseModel):
    id: Literal["A", "B", "C"]
    title: str
    message: str


class DecisionMirrorMessagesRequest(BaseModel):
    context: DecisionMirrorContext
    goal: str = Field(..., min_length=1, max_length=600)
    constraints: Optional[str] = Field(default=None, max_length=1200)
    question_attachments_text: Optional[str] = Field(default=None, max_length=6000)


class DecisionMirrorMessagesResponse(BaseModel):
    suggestions: list[DecisionSuggestion]


class DecisionMirrorScoreRequest(BaseModel):
    profile: DecisionMirrorProfile
    message: str = Field(..., min_length=1, max_length=5000)
    goal: str = Field(..., min_length=1, max_length=600)
    constraints: Optional[str] = Field(default=None, max_length=1200)


class DecisionMirrorScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=100)
    reasons: list[str]
    risk_points: list[str]
    improve_edits: list[str]


class DecisionMirrorTranscriptTurn(BaseModel):
    speaker: Speaker
    text: str = Field(..., min_length=1, max_length=1200)


class DecisionMirrorCallRequest(BaseModel):
    profile: DecisionMirrorProfile
    call_goal: str = Field(..., min_length=1, max_length=600)
    my_key_points: str = Field(..., min_length=1, max_length=2000)
    difficulty: Difficulty = "normal"
    transcript: list[DecisionMirrorTranscriptTurn] = Field(default_factory=list)


class DecisionMirrorCallNextTurn(BaseModel):
    speaker: Literal["them"] = "them"
    text: str


class DecisionMirrorCallReport(BaseModel):
    call_success_score: int = Field(..., ge=0, le=100)
    top_risks: list[str]
    power_lines: list[str]
    must_ask: list[str]
    revised_message: str
    revised_score: int = Field(..., ge=0, le=100)


class DecisionMirrorCallResponse(BaseModel):
    next_turn: Optional[DecisionMirrorCallNextTurn] = None
    done: bool = False
    report: Optional[DecisionMirrorCallReport] = None
