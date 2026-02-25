from __future__ import annotations

import json
from textwrap import dedent


def build_profile_prompt(*, email_text: str, chat_text: str, attachments_text: str) -> str:
    return dedent(
        f"""
        PROFILE_PROMPT
        역할: 너는 "Decision Mirror / 의사결정 시뮬레이터" 분석 엔진이다.
        중요: 결과는 "과거 커뮤니케이션 패턴 기반 점수"여야 하며, 미래 확정 예측처럼 쓰지 마라.
        금지: 진단, 단정, 조종/심리전 조언.
        JSON만 반환하라.

        출력 스키마:
        {{
          "profile": {{
            "decision_style": "logical|emotional|mixed",
            "risk_aversion": 0-10,
            "approval_speed": 0-10,
            "price_sensitivity": 0-10,
            "pushback_intensity": 0-10,
            "common_objections": ["..."],
            "approval_triggers": ["..."],
            "tone_style": "short_direct|formal_polite|warm",
            "rejection_patterns": ["..."]
          }},
          "evidence": {{
            "quotes": ["20~30자 내외 짧은 근거 3~6개, 개인정보 제거"]
          }}
        }}

        입력:
        - email_thread_text: {json.dumps(email_text, ensure_ascii=False)}
        - chat_log_text: {json.dumps(chat_text, ensure_ascii=False)}
        - attachments_text: {json.dumps(attachments_text, ensure_ascii=False)}
        """
    ).strip()


def build_message3_prompt(
    *,
    email_text: str,
    chat_text: str,
    attachments_text: str,
    goal: str,
    question_attachments_text: str,
    constraints: str,
    profile: dict,
) -> str:
    return dedent(
        f"""
        MESSAGE_3_PROMPT
        역할: 주어진 맥락과 프로파일로 한국어 메시지 3개를 생성한다.
        중요: 결과는 "과거 커뮤니케이션 패턴 기반 점수" 데모용 메시지다.
        금지: 상대 심리 확정, 조종/심리전.
        출력은 JSON만.

        출력 스키마:
        {{
          "suggestions": [
            {{"id":"A","title":"직설 설득형","message":"..."}},
            {{"id":"B","title":"리스크 선제 방어형","message":"..."}},
            {{"id":"C","title":"데이터 강조형","message":"..."}}
          ]
        }}

        제약:
        - 각 message는 한국어 80~180단어 내외
        - A: 결론→근거
        - B: 리스크/대안/책임
        - C: 숫자/비교/근거
        - profile.tone_style 반영

        입력:
        - goal: {json.dumps(goal, ensure_ascii=False)}
        - constraints: {json.dumps(constraints, ensure_ascii=False)}
        - profile: {json.dumps(profile, ensure_ascii=False)}
        - email_thread_text: {json.dumps(email_text, ensure_ascii=False)}
        - chat_log_text: {json.dumps(chat_text, ensure_ascii=False)}
        - attachments_text: {json.dumps(attachments_text, ensure_ascii=False)}
        - question_attachments_text: {json.dumps(question_attachments_text, ensure_ascii=False)}
        """
    ).strip()


def build_score_prompt(*, profile: dict, message: str, goal: str, constraints: str) -> str:
    return dedent(
        f"""
        SCORE_PROMPT
        역할: 아래 메시지를 "과거 커뮤니케이션 패턴 기반"으로 점수화한다.
        금지: 미래 확정 예측, 진단, 조종 조언.
        JSON만 반환.

        출력 스키마:
        {{
          "score": 0-100,
          "reasons": ["3개"],
          "risk_points": ["3개"],
          "improve_edits": ["3개"]
        }}

        입력:
        - profile: {json.dumps(profile, ensure_ascii=False)}
        - goal: {json.dumps(goal, ensure_ascii=False)}
        - constraints: {json.dumps(constraints, ensure_ascii=False)}
        - message: {json.dumps(message, ensure_ascii=False)}
        """
    ).strip()


def build_call_sim_prompt(
    *,
    profile: dict,
    call_goal: str,
    my_key_points: str,
    difficulty: str,
    transcript: list[dict],
) -> str:
    return dedent(
        f"""
        CALL_SIM_PROMPT
        역할: 상대 역할의 전화 시뮬레이터.
        반드시 상대 대사 1개만 JSON으로 반환하라.
        출력:
        {{"next_turn": {{"speaker":"them","text":"[상대] ..."}}}}

        규칙:
        - 1~2문장, 최대 220자, 구어체
        - 매 턴 질문 1개 포함
        - 이모지 금지
        - 이전 내 답변의 약점 1개를 짚고 후속 질문
        - difficulty=hard 이면 가격/결정권/리스크/마감 압박 강도 증가
        - 조종/심리전 금지

        입력:
        - profile: {json.dumps(profile, ensure_ascii=False)}
        - call_goal: {json.dumps(call_goal, ensure_ascii=False)}
        - my_key_points: {json.dumps(my_key_points, ensure_ascii=False)}
        - difficulty: {json.dumps(difficulty, ensure_ascii=False)}
        - transcript: {json.dumps(transcript, ensure_ascii=False)}
        """
    ).strip()


def build_call_report_prompt(
    *,
    profile: dict,
    call_goal: str,
    transcript: list[dict],
) -> str:
    return dedent(
        f"""
        CALL_REPORT_PROMPT
        역할: 통화 리허설 결과 코칭 리포트 생성기.
        중요: 점수는 "과거 커뮤니케이션 패턴 기반 점수"로 작성.
        JSON만 반환.

        출력 스키마:
        {{
          "report": {{
            "call_success_score": 0-100,
            "top_risks": ["3개"],
            "power_lines": ["3개"],
            "must_ask": ["2개"],
            "revised_message": "보낼 수 있는 최종 메시지",
            "revised_score": 0-100
          }}
        }}

        입력:
        - profile: {json.dumps(profile, ensure_ascii=False)}
        - call_goal: {json.dumps(call_goal, ensure_ascii=False)}
        - transcript: {json.dumps(transcript, ensure_ascii=False)}
        """
    ).strip()


def build_summarize_prompt(*, text: str, label: str) -> str:
    return dedent(
        f"""
        긴 입력을 데모용 요약으로 축약하라.
        JSON만 반환:
        {{"summary":"핵심 사실/요청/거절 패턴/리스크 신호를 8~12문장으로 요약"}}
        label={json.dumps(label, ensure_ascii=False)}
        text={json.dumps(text, ensure_ascii=False)}
        """
    ).strip()
