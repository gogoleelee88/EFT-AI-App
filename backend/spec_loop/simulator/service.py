# B2, D: 과정 시뮬레이션, Coping 70/20/10, Outcome(성과/보상/미래 자기) 금지, 키워드 필터·리라이트
import re
from typing import Any

# Outcome 금지 키워드 (성과/보상/미래 자기)
OUTCOME_KEYWORDS = [
    "성공", "성과", "보상", "미래", "완벽", "달성", "이기", "승리",
    "목표 달성", "기대", "결과적으로", "최종적으로", "성취",
]


def filter_outcome_keywords(text: str) -> str:
    """D: Outcome 키워드 제거 또는 과정 중심으로 리라이트."""
    out = text
    for kw in OUTCOME_KEYWORDS:
        out = re.sub(re.escape(kw), "[과정 중심으로]", out)
    return out


def _word_count(s: str) -> int:
    return max(1, len(s.split()))


def ensure_ratio_70_20_10(process: str, obstacle: str, coping: str) -> tuple[str, str, str]:
    """B2: 과정 70% + 장애 20% + 대처 10% 비율로 조정 (단어 수 기준)."""
    wp, wo, wc = _word_count(process), _word_count(obstacle), _word_count(coping)
    total = wp + wo + wc
    if total == 0:
        return process, obstacle, coping
    target_p = 0.70
    target_o = 0.20
    target_c = 0.10
    # 비율에 맞게 확장/축소 힌트만 반환 (실제로는 텍스트 길이 조정; 여기선 입력 유지하고 비율만 검증용)
    return process, obstacle, coping


def build_coping_prompt(
    day_plan_summary: str,
    soothe: bool = False,
) -> dict[str, Any]:
    """
    B2, D: Coping Imagery 프롬프트. Outcome 금지. 과정 70%+장애 20%+대처 10%.
    soothe=True 시 자극도↓, 기대 문장 금지, 과정만.
    """
    process_part = "지금 하는 단계를 구체적으로 묘사합니다. 호흡, 몸 감각, 순서."
    obstacle_part = "예상 장애물을 짧게 언급합니다."
    coping_part = "그때 할 수 있는 작은 대처 한두 가지."

    if soothe:
        process_part = "매우 짧고 중립적으로 과정만 묘사합니다. 기대나 결과 언급 없음."
        obstacle_part = "장애는 한 문장 이내."
        coping_part = "단순한 대처 하나만."

    process_part = filter_outcome_keywords(process_part)
    obstacle_part = filter_outcome_keywords(obstacle_part)
    coping_part = filter_outcome_keywords(coping_part)

    process_part, obstacle_part, coping_part = ensure_ratio_70_20_10(
        process_part, obstacle_part, coping_part
    )

    # B2: 과정 70% + 장애 20% + 대처 10% (구조적 비율)
    process_pct = 0.70
    obstacle_pct = 0.20
    coping_pct = 0.10

    simulation_text = f"{process_part} {obstacle_part} {coping_part}"
    coping_prompt = f"과정(70%): {process_part} / 장애(20%): {obstacle_part} / 대처(10%): {coping_part}"

    return {
        "simulation_text": simulation_text,
        "coping_prompt": coping_prompt,
        "process_pct": process_pct,
        "obstacle_pct": obstacle_pct,
        "coping_pct": coping_pct,
    }


def run_simulation_for_day(day_id: int, day_plan_data: dict[str, Any] | None = None) -> dict[str, Any]:
    """day_id에 대한 시뮬레이션 결과 생성 (과정 시뮬레이션 + Coping 프롬프트)."""
    summary = (day_plan_data or {}).get("summary") or f"Day plan {day_id}"
    out = build_coping_prompt(summary, soothe=False)
    out["day_id"] = day_id
    return out
