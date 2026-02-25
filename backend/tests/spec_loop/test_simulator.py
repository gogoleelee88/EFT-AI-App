# Slice 5: Coping Outcome 금지, 70/20/10, 키워드 필터
from backend.spec_loop.simulator.service import (
    build_coping_prompt,
    filter_outcome_keywords,
    OUTCOME_KEYWORDS,
)


def test_coping_no_outcome_only_process():
    """B2, D: Coping에 Outcome(성과/보상/미래 자기) 금지, 과정+대처만."""
    out = build_coping_prompt("오늘 계획", soothe=False)
    text = (out.get("simulation_text") or "") + (out.get("coping_prompt") or "")
    for kw in OUTCOME_KEYWORDS[:5]:
        assert kw not in text or "[과정 중심으로]" in text


def test_coping_ratio_70_20_10():
    """B2: 과정 70%+장애 20%+대처 10% 비율."""
    out = build_coping_prompt("요약", soothe=False)
    p = out.get("process_pct") or 0
    o = out.get("obstacle_pct") or 0
    c = out.get("coping_pct") or 0
    assert 0 <= p <= 1 and 0 <= o <= 1 and 0 <= c <= 1
    assert abs((p + o + c) - 1.0) < 0.01


def test_outcome_keywords_filtered():
    """D: Outcome 키워드 필터·리라이트(과정 중심)."""
    raw = "성공하면 보상이 따를 거예요. 미래의 나는 완벽해."
    filtered = filter_outcome_keywords(raw)
    assert "성공" not in filtered or "[과정 중심으로]" in filtered
    assert "보상" not in filtered or "[과정 중심으로]" in filtered
