from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()

# CORS: Vite 5173/5180 및 8000 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:5180", "http://127.0.0.1:5180",
                   "http://localhost:5184", "http://127.0.0.1:5184",
                   "http://localhost:5194", "http://127.0.0.1:5194",
                   "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- 헬스체크 ----
@app.get("/health")
@app.get("/healthz")
def healthz():
    return {"ok": True}

# ---- 타입 (프론트 예상 최소 스키마) ----
class ConversationMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    temperature: float | None = 0.7
    max_tokens: int | None = 256
    history: list[ConversationMessage] | None = None

class ChatChoice(BaseModel):
    role: str
    content: str

class ChatResponse(BaseModel):
    response: str = ""
    message: str = ""
    model: str = "stub-qwen"
    choices: list[ChatChoice] = []
    emotion_analysis: dict = {}
    eft_recommendations: list = []
    confidence_score: float = 0.8
    processing_time: float = 100
    emergency_detected: bool = False
    professional_referral: bool = False

class EmotionReq(BaseModel):
    message: str

class EmotionAnalysis(BaseModel):
    primary: str
    score: float

class EFTRecommendation(BaseModel):
    title: str
    steps: list[str]

class SuggestedAction(BaseModel):
    label: str
    kind: str

# ---- 엔드포인트: 프리미엄/일반 모두 더미 응답 ----
@app.post("/api/chat/compare")
def chat_compare(req: ChatRequest):
    return ChatResponse(
        response="(stub) 안전 모드: 프리미엄 서버 없이 데모 응답을 반환합니다. 심호흡 4-7-8 호흡을 3회 해보세요.",
        message="안전 모드 응답",
        emotion_analysis={
            "primary_emotion": "neutral",
            "intensity": 0.5,
            "confidence": 0.8,
            "triggers": []
        },
        choices=[ChatChoice(role="assistant", content="심호흡 4-7-8 호흡을 3회 해보세요.")]
    )

@app.post("/api/chat/premium")
@app.post("/api/premium/chat")
def chat_premium(req: ChatRequest):
    return ChatResponse(
        response="(stub) 프리미엄 경로: vLLM 미기동 시 임시 응답. 잠들기 전 점진적 근육 이완을 권장합니다.",
        message="프리미엄 경로 응답",
        emotion_analysis={
            "primary_emotion": "stress",
            "intensity": 0.7,
            "confidence": 0.9,
            "triggers": ["work", "sleep"]
        },
        choices=[ChatChoice(role="assistant", content="잠들기 전 점진적 근육 이완을 권장합니다.")]
    )

@app.post("/api/chat")
def chat_general(req: ChatRequest):
    return ChatResponse(
        response="안녕하세요! EFT AI 상담사입니다. 오늘은 어떤 기분이신가요? 편안하게 이야기해 주세요.",
        message="일반 채팅 응답",
        emotion_analysis={
            "primary_emotion": "neutral",
            "intensity": 0.5,
            "confidence": 0.8,
            "triggers": []
        }
    )

@app.post("/api/emotion/analyze")
def emotion_analyze(req: EmotionReq):
    return EmotionAnalysis(primary="anxiety", score=0.72)

@app.post("/api/eft/recommend")
def eft_recommend(req: ChatRequest):
    return EFTRecommendation(
        title="불안 완화 EFT 루틴",
        steps=["손날을 두드리며 문구 따라하기", "눈썹-눈옆-눈밑-코밑-턱-쇄골-겨드랑이 순서로 2회"]
    )

@app.post("/api/actions/suggest")
def suggest_actions(req: EmotionReq):
    return [
        SuggestedAction(label="4-7-8 호흡", kind="breathing"),
        SuggestedAction(label="짧은 바디스캔", kind="mindfulness")
    ]

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)