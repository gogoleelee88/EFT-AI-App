"""
§14 블록 플래너(LLM) 유닛 테스트.
정상 파싱 / 파싱 실패 / constraint 위반 폴백.
"""

import pytest
from backend.domain_types.guidance_schema import PlannerPlan, PlannerBlock
from backend.services.planner_service import (
    validate_plan,
    _parse_planner_json,
    get_crisis_fixed_scenario_blocks,
    planner_blocks_to_scenario_blocks,
)


def test_validate_plan_ok():
    """정상: 2~6블록, sum(duration_s) within total_target_s ± 60 → (True, None)."""
    plan = PlannerPlan(
        total_target_s=480,
        blocks=[
            PlannerBlock(type="breath_regulation", duration_s=120, intensity=0.4),
            PlannerBlock(type="body_release", duration_s=120, intensity=0.4),
            PlannerBlock(type="defusion", duration_s=180, intensity=0.3),
            PlannerBlock(type="activation", duration_s=60, intensity=0.6),
        ],
    )
    assert sum(b.duration_s for b in plan.blocks) == 480
    ok, reason = validate_plan(plan)
    assert ok is True
    assert reason is None


def test_parse_planner_json_fail():
    """파싱 실패: JSON 아님 또는 스키마 불일치 → None."""
    assert _parse_planner_json("not json at all") is None
    assert _parse_planner_json("") is None
    assert _parse_planner_json('{"total_target_s": 480}') is None  # blocks 없음
    assert _parse_planner_json('{"total_target_s": 480, "blocks": [{"type": "invalid_type", "duration_s": 120, "intensity": 0.5}]}') is None


def test_validate_plan_constraint_violation():
    """constraint 위반: sum(duration_s) outside total_target_s ± 60 → (False, "constraints")."""
    # sum(duration_s) 가 total_target_s ± 60 밖
    plan_sum_bad = PlannerPlan(
        total_target_s=480,
        blocks=[
            PlannerBlock(type="breath_regulation", duration_s=100, intensity=0.5),
            PlannerBlock(type="grounding", duration_s=100, intensity=0.5),
        ],
    )
    assert abs(200 - 480) > 60
    ok, reason = validate_plan(plan_sum_bad)
    assert ok is False
    assert reason == "constraints"


def test_crisis_fixed_scenario_blocks():
    """crisis 고정 플랜: grounding + breath_regulation 2블록."""
    blocks = get_crisis_fixed_scenario_blocks()
    assert len(blocks) == 2
    assert blocks[0].type == "grounding"
    assert blocks[1].type == "breath_regulation"


def test_planner_blocks_to_scenario_blocks():
    """PlannerBlock 리스트 → ScenarioBlock 리스트 변환."""
    planner_blocks = [
        PlannerBlock(type="grounding", duration_s=120, intensity=0.5),
        PlannerBlock(type="breath_regulation", duration_s=120, intensity=0.4),
    ]
    scenario = planner_blocks_to_scenario_blocks(planner_blocks)
    assert len(scenario) == 2
    assert scenario[0].block_id.startswith("planner_grounding_")
    assert scenario[0].base_text
    assert scenario[1].type == "breath_regulation"
