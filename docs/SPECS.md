
# [MoodTalk Agent] 시스템 설계 명세서 (Modified)

## 0. 아키텍처 (Microservice Structure)
- **Role:** MoodTalk 메인 앱의 요청을 받아 PC를 제어하는 "로컬 에이전트 서버"
- **Communication:** REST API (FastAPI)
    - MoodTalk 앱이 `POST /api/task/start`를 호출하면 작업 시작.
    - 작업이 끝나면 `POST /webhook/result`로 MoodTalk에 결과 전송.

## 1. 아키텍처
- Type: On-Device Agent (Modular Monolithic)
- Backend: Python FastAPI
- AI Engine: LangGraph (Reasoning), OmniParser (Vision), Ollama (LLM)
- Database: ChromaDB (Vector), SQLite (Logs)

## 2. 핵심 모듈
### A. Perception (눈)
- Input: Screen Capture
- Logic: OmniParser로 UI 요소(Bounding Box) 및 텍스트 추출
- Output: Screen DOM JSON

### B. Reasoning (뇌)
- Logic: LangGraph 기반 State Machine
- Nodes: Observe -> Think(System 2 World Model) -> Act -> Verify
- Context: 이전 행동 로그 + RAG(매뉴얼) 참조

### C. Action (손)
- Logic: PyAutoGUI(Desktop) + Playwright(Web) 하이브리드 제어
- Safety: 민감한 키워드(결제 등) 감지 시 Human Confirmation 팝업

## 3. 데이터 스키마
- Task Workflow: `task_name`, `steps` list (YAML)
- Logs: Timestamp, Action Type, Screenshot Path

## 4. 인수인계(Recording) 프로세스
1. Recording Mode Start (Global Listener On)
2. User Actions Loop (Click/Type -> Log Save)
3. Stop Button Click
4. **Task Naming Modal:** 팝업을 띄워 사용자에게 업무 이름(`task_name`) 입력받음
5. LLM Processing: Raw Log -> Generalized Workflow 변환 및 저장