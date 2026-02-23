from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

from backend.models.proposal_os import ArtifactVersion
from schemas.proposal_os import ProposalContentReco, SignalResponse


def generate_content_recos(
    role_inference: str,
    signals: list[SignalResponse],
) -> list[ProposalContentReco]:
    seed = " ".join([role_inference, *[s.title for s in signals[:3]]]).lower()

    if "legal" in seed:
        return [
            ProposalContentReco(
                title="Legal Operations Playbook",
                url="https://hbr.org/",
                rationale_summary="법무와 운영 기준이 필요한 시점에 유용한 리소스입니다.",
            ),
            ProposalContentReco(
                title="Regulatory Updates Tracker",
                url="https://www.oecd.org/",
                rationale_summary="규제 및 정책 업데이트를 빠르게 추적해 의사결정 정확도를 높입니다.",
            ),
        ]
    if "finance" in seed or "financial" in seed:
        return [
            ProposalContentReco(
                title="FP&A Best Practice Brief",
                url="https://www.mckinsey.com/",
                rationale_summary="재무/예산 의사결정을 위한 실행 가능한 분석 프레임을 제공합니다.",
            ),
            ProposalContentReco(
                title="Accounting Policy Insights",
                url="https://www.ifrs.org/",
                rationale_summary="회계 기준과 정책 변경 사항을 확인하고 리스크를 줄일 수 있습니다.",
            ),
        ]
    if "startup" in seed:
        return [
            ProposalContentReco(
                title="Startup Metrics Guide",
                url="https://www.ycombinator.com/library",
                rationale_summary="초기 기업 성장 지표 관리에 필요한 핵심 프레임과 실무 팁을 정리했습니다.",
            ),
            ProposalContentReco(
                title="Product Positioning Primer",
                url="https://www.productplan.com/",
                rationale_summary="제품 포지셔닝의 핵심 축을 점검해 메시지 정합성을 강화합니다.",
            ),
        ]
    return [
        ProposalContentReco(
            title="High Performance Work Habits",
            url="https://jamesclear.com/articles",
            rationale_summary="업무 몰입과 습관 형성에 도움 되는 실무형 콘텐츠를 추천합니다.",
        ),
        ProposalContentReco(
            title="Decision Memo Framework",
            url="https://www.atlassian.com/",
            rationale_summary="의사결정 기록을 구조화해 팀 내 합의를 빠르게 만듭니다.",
        ),
    ]


def persist_content_recos(
    db: Session,
    proposal_id: str,
    content_recos: Iterable[ProposalContentReco],
) -> ArtifactVersion:
    payload = [item.model_dump(mode="json") for item in content_recos]
    artifact = ArtifactVersion(
        proposal_id=proposal_id,
        artifact_type="content_reco",
        artifact_id="content_reco_bundle",
        version_no=1,
        payload=payload,
        created_at=None,
        metadata_json={"kind": "content_reco"},
    )
    db.add(artifact)
    db.flush()
    return artifact
