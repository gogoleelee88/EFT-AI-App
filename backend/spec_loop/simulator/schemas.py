# POST /simulate/day 요청
from pydantic import BaseModel


class SimulateDayRequest(BaseModel):
    day_id: int


class CopingPromptResult(BaseModel):
    """Coping 프롬프트 결과: 과정 70%+장애 20%+대처 10%, Outcome 금지."""
    simulation_text: str
    coping_prompt: str
    process_pct: float
    obstacle_pct: float
    coping_pct: float
