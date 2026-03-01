from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


Relationship = Literal["boss", "peer", "client", "friend", "family", "stranger", "romance_interest"]
Goal = Literal["request", "refuse", "negotiate", "maintain", "deescalate"]
ImageGoal = Literal["professional", "kind", "firm_polite", "leaderlike", "humble", "relaxed"]
BannedTone = Literal["blame", "over_apology", "excuses", "emotional_outburst"]
RiskType = Literal[
    "emotional_overheat",
    "blame",
    "accusation",
    "legal_risk",
    "ambiguity",
    "relationship_risk",
    "manipulation_risk",
]
RiskSeverity = Literal["low", "med", "high"]
ReactionType = Literal["accept", "pushback", "ask_more", "ignore", "upset"]
Likelihood = Literal["high", "med", "low"]
ReplyTone = Literal["soft", "neutral", "firm"]
FollowupReaction = Literal["pushback", "ask_more", "ignore", "upset"]
SendPolicy = Literal["prefer_fast", "prefer_calm", "prefer_boundary"]
ActionType = Literal["send_now", "wait_and_send", "pause_thread", "ask_clarifying", "switch_channel"]
InterestHypothesisLabel = Literal[
    "engagement_high",
    "polite_distance",
    "testing_boundaries",
    "comfort_building",
    "low_investment",
]


class CoachContext(BaseModel):
    relationship: Optional[Relationship] = None
    goal: Optional[Goal] = None
    image_goal: Optional[list[ImageGoal]] = None
    banned_tones: Optional[list[BannedTone]] = None
    language: str = "ko"
    default_send_policy: Optional[SendPolicy] = None


class CoachMessageInput(BaseModel):
    their_last_message: Optional[str] = None
    my_draft: str = Field(..., min_length=1)
    thread_summary: Optional[str] = None
    attachment_ids: Optional[list[str]] = None


class CoachAnalyzeRequest(BaseModel):
    room_id: str = Field(..., min_length=1)
    context: CoachContext
    message: CoachMessageInput


class CoachRisk(BaseModel):
    type: RiskType
    severity: RiskSeverity
    note: str


class CoachAnalysis(BaseModel):
    politeness_score: int = Field(..., ge=0, le=100)
    clarity_score: int = Field(..., ge=0, le=100)
    boundary_strength: int = Field(..., ge=0, le=100)
    risks: list[CoachRisk]
    misread_points: list[str]


class CoachSimulation(BaseModel):
    reaction: ReactionType
    likelihood: Likelihood
    why: str
    confidence: float = Field(..., ge=0, le=1)


class CoachReply(BaseModel):
    tone: ReplyTone
    text: str
    expected_outcome: str
    tradeoffs: list[str]
    confidence: float = Field(..., ge=0, le=1)


class CoachFollowup(BaseModel):
    if_reaction: FollowupReaction
    text: str


class CoachActionFallback(BaseModel):
    text: str
    note: str


class CoachAction(BaseModel):
    type: ActionType
    recommended_time: Optional[str] = None
    rationale: list[str]
    execution_steps: list[str]
    fallback_if_user_insists_send_now: CoachActionFallback


class RomanceInterestHypothesis(BaseModel):
    label: InterestHypothesisLabel
    likelihood: Likelihood
    evidence_quotes: list[str]
    alternative_explanations: list[str]
    what_to_do: list[str]


class RomanceCompatibilityNotes(BaseModel):
    my_strengths: list[str]
    my_risks: list[str]
    watchouts: list[str]


class RomanceInsights(BaseModel):
    interest_hypotheses: list[RomanceInterestHypothesis]
    compatibility_notes: RomanceCompatibilityNotes
    safe_clarifying_questions: list[str]


class CoachSuggestedMessage(BaseModel):
    label: str
    text: str = Field(..., min_length=1)


class CoachInternal(BaseModel):
    notes: list[str] = Field(default_factory=list)
    banned_sections_detected: list[str] = Field(default_factory=list)
    rewrite_applied: bool = False


class CoachPolicy(BaseModel):
    rewrite_applied: bool = False
    banned_patterns_detected: list[str] = Field(default_factory=list)


class CoachAnalyzeResponse(BaseModel):
    messages: list[CoachSuggestedMessage] = Field(default_factory=list)
    action: CoachAction
    analysis: CoachAnalysis
    simulations: list[CoachSimulation]
    replies: list[CoachReply]
    followups: list[CoachFollowup]
    romance_insights: Optional[RomanceInsights] = None
    evidence_items: list[str] = Field(default_factory=list)
    confidence: float = Field(..., ge=0, le=1)
    internal: CoachInternal = Field(default_factory=CoachInternal)
    policy: CoachPolicy = Field(default_factory=CoachPolicy)
