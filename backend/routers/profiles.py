from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.proposal_os import AspirationProfile, CapabilityProfile
from schemas.proposal_os import (
    AspirationProfileResponse,
    AspirationProfileUpsertRequest,
    CapabilityProfileResponse,
    CapabilityProfileUpsertRequest,
)

router = APIRouter(tags=["proposal-os-profiles"])


def _aspiration_to_response(row: AspirationProfile) -> AspirationProfileResponse:
    return AspirationProfileResponse(
        aspiration_profile_id=row.aspiration_profile_id,
        user_id=row.user_id,
        aspiration_statement=row.aspiration_statement,
        target_identity=row.target_identity,
        north_star_goal=row.north_star_goal,
        horizon_90d=row.horizon_90d or [],
        values=row.values or [],
        constraints=row.constraints or [],
        updated_at=row.updated_at,
    )


def _capability_to_response(row: CapabilityProfile) -> CapabilityProfileResponse:
    return CapabilityProfileResponse(
        capability_profile_id=row.capability_profile_id,
        user_id=row.user_id,
        strengths=row.strengths or [],
        experience_highlights=row.experience_highlights or [],
        domain_focus=row.domain_focus or [],
        certifications=row.certifications or [],
        tool_stack=row.tool_stack or [],
        updated_at=row.updated_at,
    )


@router.put("/profiles/aspiration", response_model=AspirationProfileResponse)
@router.put("/api/profiles/aspiration", response_model=AspirationProfileResponse)
def upsert_aspiration_profile(
    body: AspirationProfileUpsertRequest,
    db: Session = Depends(get_db),
) -> AspirationProfileResponse:
    row = db.query(AspirationProfile).filter(AspirationProfile.user_id == body.user_id).one_or_none()
    if row is None:
        row = AspirationProfile(user_id=body.user_id, aspiration_statement=body.aspiration_statement)
        db.add(row)

    row.aspiration_statement = body.aspiration_statement
    row.target_identity = body.target_identity
    row.north_star_goal = body.north_star_goal
    row.horizon_90d = body.horizon_90d
    row.values = body.values
    row.constraints = body.constraints
    db.commit()
    db.refresh(row)
    return _aspiration_to_response(row)


@router.get("/profiles/aspiration/{user_id}", response_model=AspirationProfileResponse)
@router.get("/api/profiles/aspiration/{user_id}", response_model=AspirationProfileResponse)
def get_aspiration_profile(user_id: str, db: Session = Depends(get_db)) -> AspirationProfileResponse:
    row = db.query(AspirationProfile).filter(AspirationProfile.user_id == user_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="aspiration profile not found")
    return _aspiration_to_response(row)


@router.delete("/profiles/aspiration/{user_id}")
@router.delete("/api/profiles/aspiration/{user_id}")
def delete_aspiration_profile(user_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.query(AspirationProfile).filter(AspirationProfile.user_id == user_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="aspiration profile not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.put("/profiles/capability", response_model=CapabilityProfileResponse)
@router.put("/api/profiles/capability", response_model=CapabilityProfileResponse)
def upsert_capability_profile(
    body: CapabilityProfileUpsertRequest,
    db: Session = Depends(get_db),
) -> CapabilityProfileResponse:
    row = db.query(CapabilityProfile).filter(CapabilityProfile.user_id == body.user_id).one_or_none()
    if row is None:
        row = CapabilityProfile(user_id=body.user_id)
        db.add(row)

    row.strengths = body.strengths
    row.experience_highlights = body.experience_highlights
    row.domain_focus = body.domain_focus
    row.certifications = body.certifications
    row.tool_stack = body.tool_stack
    db.commit()
    db.refresh(row)
    return _capability_to_response(row)


@router.get("/profiles/capability/{user_id}", response_model=CapabilityProfileResponse)
@router.get("/api/profiles/capability/{user_id}", response_model=CapabilityProfileResponse)
def get_capability_profile(user_id: str, db: Session = Depends(get_db)) -> CapabilityProfileResponse:
    row = db.query(CapabilityProfile).filter(CapabilityProfile.user_id == user_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="capability profile not found")
    return _capability_to_response(row)


@router.delete("/profiles/capability/{user_id}")
@router.delete("/api/profiles/capability/{user_id}")
def delete_capability_profile(user_id: str, db: Session = Depends(get_db)) -> dict[str, bool]:
    row = db.query(CapabilityProfile).filter(CapabilityProfile.user_id == user_id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="capability profile not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


