import pathlib
import re
import sys
from typing import Dict, Optional

# 이 스크립트는 'compare.py' 파일의 v4 버전을 v6.0으로 패치합니다.
# v6.0의 핵심 로직:
# 1. "수집 키" (9개)와 "분석 키" (2개)를 명확히 분리합니다.
# 2. "수집 키" 목록 (INTAKE_QUESTIONS)의 순서를 '감정'을 먼저 묻도록 자연스럽게 변경합니다.
# 3. "파싱 AI" (build_checklist_prompt)는 11키 (수집 9 + 분석 2) JSON을 반환하도록 요청받습니다.
# 4. "Python 코드" (compare 함수)가 '9개 수집 키'와 'intensity'를 직접 체크하여
#    - [흐름 1: 상담] (9개 수집 키 O, intensity 숫자 O)
#    - [흐름 2: 강도 질문] (8개 수집 키 O, intensity가 숫자가 아님)
#    - [흐름 3: 수집] (8개 수집 키 X, 예: 'core_emotion'부터 질문)
#    로 분기시킵니다.

p = pathlib.Path("backend/routers/compare.py")
try:
    src = p.read_text(encoding="utf-8")
except FileNotFoundError:
    print(f"❌ 오류: 'backend/routers/compare.py' 파일을 찾을 수 없습니다.")
    print("스크립트를 실행하기 전에 '.bak.v5' 파일로 복원을 먼저 실행해주세요.")
    sys.exit(1)

original_src = src
changes_made = 0

# --- 1. 'INTAKE_QUESTIONS' (50라인)을 "9키 수집 목록 (v6.0)"으로 교체 ---
# [역할] Python이 사용자에게 '질문'할 때 사용하는 목록 (총 9개 키)
# [흐름] 'situation' 다음에 'core_emotion'을 물어보도록 순서를 변경 (자연스러운 대화)
v6_0_intake_questions = r"""INTAKE_QUESTIONS = [
    # [v6.0] 9개의 "수집 키" (사용자에게 질문해도 안전한 키)
    # [순서 변경] situation -> core_emotion -> automatic_thought 순으로 질문
    {"key": "situation",          "question": "어떤 상황에서 그런 감정이 드셨나요?"},
    {"key": "core_emotion",         "question": "그때 가장 크게 느껴지는 감정은 무엇인가요?"},
    {"key": "automatic_thought",    "question": "그때 어떤 생각이 반복되셨나요?"},
    {"key": "physical_sensation", "question": "몸에서는 어떤 신호가 느껴지셨어요?"},
    {"key": "behavioral_reaction",  "question": "그 감정이 들었을 때 어떻게 반응하셨나요?"},
    {"key": "intensity",            "question": "지금 그 감정의 강도는 얼마나 되나요?"},
    {"key": "environment",          "question": "혹시 지금 대화에 집중할 수 있는 편안한 공간에 계신가요?"},
    {"key": "time_commitment",      "question": "충분히 시간을 가지고 대화하는 것이 괜찮으신가요?"},
    {"key": "elaboration",          "question": "그 상황에 대해 조금 더 말씀해주실 수 있나요?"},
]"""

# re.sub로 INTAKE_QUESTIONS 교체
src, count = re.subn(
    r"(?s)INTAKE_QUESTIONS = \[\s*\{[\s\S]*?\}\s*\]", # 50라인 근처
    v6_0_intake_questions,
    src,
    count=1
)
if count > 0: changes_made += 1


# --- 2. '_CANON_KEYS' (94라인)를 "9키 수집 목록"으로 교체 ---
# [역할] KV 파서(_extract_kv_from_text)가 '빠른 수집'할 때 사용하는 9개 키
v6_0_canon_keys = r"""_CANON_KEYS = {
    # [v6.0] 9개의 "수집 키"
    "situation", "core_emotion", "automatic_thought", "physical_sensation",
    "behavioral_reaction", "intensity", "environment", "time_commitment",
    "elaboration"
}"""

# re.sub로 _CANON_KEYS 교체
src, count = re.subn(
    r"(?s)_CANON_KEYS = \{\s*\"situation\"[\s\S]*?\}", # 94라인 근처
    v6_0_canon_keys,
    src,
    count=1
)
if count > 0: changes_made += 1


# --- 3. 'build_checklist_prompt' (186라인)을 '추출 전용 (11키)' 프롬프트로 교체 ---
# [역할] "파싱 AI"의 임무를 '데이터 추출'로 한정합니다.
# [흐름] 이 AI는 v7/v6 훈련 데이터로 파인튜닝될 것을 가정하고,
#        9개의 "수집 키" + 2개의 "분석 키" = 총 11키 JSON을 반환하도록 요청받습니다.
new_prompt_function = r'''
def build_checklist_prompt(user_message: str, session_state: SessionState) -> str:
    # 이 함수는 "파싱 AI"(Llama3/Qwen)를 호출하기 위한 프롬프트를 생성합니다.
    # v6.0 로직: 이 AI는 '질문'을 생성하지 않고 오직 '데이터 추출/추론'에만 집중합니다.
    checklist_json = session_state.model_dump_json(indent=2)
    return f"""
You are a meticulous data extraction AI. Your ONLY job is to extract and infer.

# Mission
1.  **Analyze**: Carefully read the "User message".
2.  **Extract & Infer**: Fill in the `value` for *all 11 checklist keys* based *only* on the "User message".
    - Keys 1-9 (situation...elaboration) are **Extracted**.
    - Keys 10-11 (distortion, need) are **Inferred** (추론).
3.  **Format**: Return ONLY a single JSON object.

# Rules
-   **DO NOT generate questions.** `response_for_user` MUST be an empty string `""`.
-   You MUST return all 11 keys.
-   If you cannot find information for a key, return `null` for its `value`.

# Input
-   User message: "{user_message}"
-   Current checklist (for context, but prioritize User message):
{checklist_json}

# Strict JSON schema
{{
  "response_for_user": "",
  "updated_checklist": [
    {{"key": "situation", "question": "어떤 상황에서 그런 감정이 드셨나요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "core_emotion", "question": "그때 가장 크게 느껴지는 감정은 무엇인가요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "automatic_thought", "question": "그때 어떤 생각이 반복되셨나요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "physical_sensation", "question": "몸에서는 어떤 신호가 느껴지셨어요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "behavioral_reaction", "question": "그 감정이 들었을 때 어떻게 반응하셨나요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "intensity", "question": "지금 그 감정의 강도는 얼마나 되나요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "environment", "question": "혹시 지금 대화에 집중할 수 있는 편안한 공간에 계신가요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "time_commitment", "question": "충분히 시간을 가지고 대화하는 것이 괜찮으신가요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    {{"key": "elaboration", "question": "그 상황에 대해 조금 더 말씀해주실 수 있나요?", "value": "string (Extracted value) or null", "ask_count": 0}},
    
    {{"key": "cognitive_distortion", "question": "(추론) 어떤 인지 왜곡이 보이나요?", "value": "string (Inferred value) or null", "ask_count": 0}},
    {{"key": "underlying_need", "question": "(추론) 어떤 기저 욕구가 있나요?", "value": "string (Inferred value) or null", "ask_count": 0}}
  ]
}}
""".strip()
'''

# re.sub로 build_checklist_prompt 교체
# (v4 프롬프트의 끝부분("...]]\n}}\n""".strip())")을 찾아서 교체)
src, count = re.subn(
    r"def build_checklist_prompt\([\s\S]*?\}\n\s*\]\n\}\n\"\"\"\.strip\(\)",
    new_prompt_function.strip(),
    src,
    count=1,
    flags=re.DOTALL
)
if count > 0: changes_made += 1


# --- 4. 'if all_filled:' 블록(350라인)을 찾아서 제거 ---
# [역할] v4의 'if all_filled:' 블록은 AI 파싱 전에 실행되어, KV 파싱만으로 찼을 때만 동작했습니다.
# [흐름] 이 로직은 이제 'try...except' 블록 안으로 통합되므로, 여기서는 삭제합니다.
src, count = re.subn(
    r"(?s)^\s*if all_filled:\s*async with httpx\.AsyncClient\([\s\S]*?parsed_ok = True\s*\n",
    "", # 통째로 삭제
    src,
    count=1,
    flags=re.M
)
if count > 0: changes_made += 1


# --- 5. 'compare' 함수 메인 로직(try...except 블록) 수정 (v6.0) ---
# [역할] "파싱 AI"가 반환한 11키 JSON을 Python이 검사하여 3가지 흐름으로 분기시킵니다.
# [흐름 1] (성공) 9개 수집 키 O + intensity 숫자 O -> "정리 AI" -> "상담 AI" -> EFT/호흡 (actions 반환)
# [흐름 2] (강도 질문) 8개 수집 키 O + intensity가 숫자가 아님 -> Python이 강도를 숫자로 질문
# [흐름 3] (수집) 8개 수집 키 X -> Python이 '새로운 9키 목록' 순서대로 질문 (예: "감정은?")

# 322라인의 'ai_response = AIResponse...' ~ 428라인의 'except (json.JSONDecodeError...' 직전까지를 교체합니다.
original_logic_pattern = r"""(?s)ai_response = AIResponse\(\*\*ai_response_data\)\s*# 5.1\) checklist 병합[\s\S]*?if not parsed_ok:\s*# 일반 경로\(질문 지속\)[\s\S]*?final_actions = \[\{\"type\": \"ask_suds\",[\s\S]*?\}\]"""

# [v6.0] 새로운 로직 (상세 주석 포함)
replacement_logic = r"""ai_response = AIResponse(**ai_response_data)

                # --- [V6.0 로직 시작] ---
                # [역할] "파싱 AI"(Llama3)가 반환한 11키 JSON(ai_response)을 Python이 검사할 차례입니다.
                
                # 1. AI가 파싱한 checklist를 세션에 우선 저장합니다. (가장 최신 상태 유지)
                session_storage[session_id] = SessionState(
                    checklist=ai_response.updated_checklist,
                    first_turn_done=True
                )

                # 2. 'ck' 딕셔너리를 다시 만듭니다. (KV 파싱 + AI 파싱 병합)
                ck: Dict[str, Optional[str]] = {}
                for it in ai_response.updated_checklist:
                    # AI가 11키를 모두 반환했으므로, 11키 모두 ck에 저장됩니다.
                    if isinstance(it, dict):
                        ck[it.get("key")] = (it.get("value") if "value" in it else None)
                    else:
                        ck[getattr(it, "key", None)] = getattr(it, "value", None)
                
                # [중요] kv_user (규칙 기반)는 _CANON_KEYS (9키)만 인식합니다.
                if kv_user:
                    for k, v in kv_user.items():
                        if k in _CANON_KEYS and (ck.get(k) is None or str(ck.get(k)).strip() == ""):
                            ck[k] = v
                
                # 3. Python이 "9개의 수집 키"와 "intensity"를 직접 체크합니다.
                def _filled_v60(v): return v is not None and str(v).strip() not in ("", "null", "None")
                
                # [v6.0] canon_keys_v60는 'INTAKE_QUESTIONS' (9키)를 기반으로 합니다.
                # "cognitive_distortion" 등 '분석 키'는 검사 대상에서 제외됩니다. (사용자님 지적 반영)
                canon_keys_v60 = [x["key"] for x in INTAKE_QUESTIONS] 
                
                # 'intensity'를 제외한 8개의 "수집 키"가 모두 채워졌는지 확인
                other_collection_keys = [k for k in canon_keys_v60 if k != "intensity"]
                all_other_keys_filled = all(_filled_v60(ck.get(k)) for k in other_collection_keys)
                
                # 'intensity'가 '숫자'로 채워졌는지 확인
                numerical_intensity = _parse_intensity_local(ck.get("intensity"))

                # --- 4. [흐름 분기] ---
                
                if all_other_keys_filled and numerical_intensity is not None:
                    # [흐름 1: 최종 성공 (상담 시작)]
                    # 8개 수집 키가 다 찼고, 'intensity'도 숫자로 확인됨.
                    # '상담 요약' 및 'actions' (EFT/호흡) 분기로 이동합니다.
                    
                    logger.warning(f"✅ V6.0: [흐름 1 - 상담 시작] (intensity: {numerical_intensity})")
                    
                    async with httpx.AsyncClient(timeout=ENGINE_HTTP_TIMEOUT) as _client:
                        # 4-1. "정리 AI" 호출 (1인칭 오염 제거, 137라인)
                        logger.warning(f"Original CK (contaminated, 11 keys): {ck}")
                        cleaned_ck = await _ts_summarize_checklist_keys_llm(
                            client=_client, model=ENGINE_A_MODEL, ck=ck,
                            engine_url=ENGINE_A_URL, content_type=ENGINE_CONTENT_TYPE,
                            timeout=ENGINE_HTTP_TIMEOUT, logger=logger,
                        )
                        logger.warning(f"Cleaned CK (decontaminated): {cleaned_ck}")

                        # 4-2. "상담 AI" 호출 (요약문 생성, 117라인)
                        summary = await _ts_generate_therapist_summary_llm(
                            client=_client, model=ENGINE_A_MODEL, ck=cleaned_ck, # 'cleaned_ck' 사용
                            intensity=numerical_intensity, engine_url=ENGINE_A_URL,
                            content_type=ENGINE_CONTENT_TYPE, timeout=ENGINE_HTTP_TIMEOUT, logger=logger,
                        )
                        if summary:
                            try:
                                summary = _postprocess_therapist_text(summary)
                            except NameError:
                                pass
                        
                        # 4-3. 'actions' (EFT/호흡) 결정
                        if numerical_intensity >= 7:
                            next_action = {"type": "start_eft",
                                           "payload": {"preset": "quick_relief", "intensity": numerical_intensity, "script_hint": "안전/수용·자책완화"}}
                            bridge_line = "지금은 강도가 높아서, 바로 EFT(감정자유기법)로 짧게 안정화를 시작할게요."
                        else:
                            next_action = {"type": "start_breath",
                                           "payload": {"style": "box", "duration": "short", "rounds": 3}}
                            bridge_line = "지금은 호흡 안정화(박스 호흡 4-4-4-4)부터 2~3라운드 가볍게 시작할게요."

                        # 4-4. 요약 템플릿 (AI 요약 실패 시)
                        if not summary:
                            s = (cleaned_ck.get("situation") or "").strip()
                            t = (cleaned_ck.get("thought") or "").strip()
                            ps= (cleaned_ck.get("physical_sensation") or "").strip()
                            pieces = []
                            if s:  pieces.append(f"당시 ‘{s}’ 상황에서")
                            if t:  pieces.append(f"‘{t}’ 생각이 잦았고")
                            if ps: pieces.append(f"몸에서는 ‘{ps}’ 신호가 있었으며")
                            summary = " ".join(pieces).strip() or "말씀을 차분히 잘 정리해주셨어요."

                        # 4-5. 최종 응답 생성
                        user_facing_response = f"{summary}\n\n{bridge_line}"
                        final_actions = [next_action]
                        parsed_ok = True

                elif all_other_keys_filled and numerical_intensity is None:
                    # [흐름 2: 강도 질문]
                    # 8개 수집 키는 다 찼는데, 'intensity'가 'null'이거나 "매우 높음" 같은 '숫자가 아닌 값'임.
                    # 사용자에게 '숫자' 강도를 되묻습니다.
                    
                    logger.warning(f"✅ V6.0: [흐름 2 - 강도 질문] (value: {ck.get('intensity')})")
                    user_facing_response = "말씀 감사합니다. 지금 느끼시는 감정의 강도를 0에서 10 사이의 **숫자**로 알려주시겠어요?"
                    final_actions = [{"type": "ask_suds",
                                      "payload": {"ui": "banner", "message": "현재 감정 강도(0~10)를 숫자로 알려주세요."}}]
                    parsed_ok = True

                else:
                    # [흐름 3: 수집]
                    # 'situation' 등 'intensity' 외의 다른 8개 "수집 키" 중 빠진 것이 있음.
                    # Python이 '_fallback_ask_next' (225라인)를 호출하여 빠진 첫 번째 항목을 질문합니다.
                    # [v6.0] 'INTAKE_QUESTIONS' 목록 순서가 변경되었으므로,
                    # 'situation' 다음 'core_emotion'을 묻게 됩니다. (자연스러운 순서)
                    
                    logger.warning(f"✅ V6.0: [흐름 3 - 수집] (빠진 키가 있음)")
                    user_facing_response = _fallback_ask_next(session_state)
                    # final_actions는 빈 [] 상태로 둠
                    parsed_ok = True
"""

# re.sub로 메인 로직 교체
# (v5.3의 패턴(428라인)과 동일한 정규식을 사용합니다)
src, count = re.subn(
    original_logic_pattern,
    replacement_logic.strip(),
    src,
    count=1,
    flags=re.DOTALL
)
if count > 0:
    changes_made += 1


# --- 최종 확인 ---
# 5개 항목이 변경되어야 함 (INTAKE, CANON, build_prompt, if_all_filled, main_logic)
if changes_made >= 5:
    p.write_text(src, encoding="utf-8")
    print("---")
    print("✅✅✅ 'compare.py' 패치 완료 (v6.0) ✅✅✅")
    print("1. 'INTAKE_QUESTIONS' (질문 목록)을 '9키 v6.0' (자연스러운 순서)으로 변경했습니다.")
    print("2. '_CANON_KEYS'도 '9키 v6.0' 기준으로 업데이트했습니다.")
    print("3. 'build_checklist_prompt'를 '추출 전용 (11키)'으로 변경했습니다.")
    print("4. 'if all_filled:' (v4) 블록을 삭제했습니다.")
    print("5. 메인 로직을 [성공] / [강도 질문] / [수집] 3가지로 분기하도록 수정했습니다.")
    print("ℹ️ 이제 파인튜닝된 v7(11키) 모델을 사용할 준비가 되었습니다.")
else:
    print("---")
    print(f"❌❌❌ 'compare.py' 패치 실패 (v6.0) ❌❌❌")
    print(f"변경된 부분: {changes_made} / 5 (5개 항목이 변경되어야 함)")
    print("패턴이 일치하지 않습니다. 'compare.py.bak.v5' 파일로 다시 복원하고 재시도하세요.")
    
    # 디버깅을 위해 각 단계의 성공 여부를 추적 (메모리 내 변수 사용)
    src_check = p.read_text(encoding="utf-8") # 원본을 다시 읽음
    step1_ok = "core_emotion" in re.search(r"(?s)INTAKE_QUESTIONS = \[\s*\{[\s\S]*?\}\s*\]", src).group(0)
    step2_ok = "core_emotion" in re.search(r"(?s)_CANON_KEYS = \{\s*\"situation\"[\s\S]*?\}", src).group(0)
    step3_ok = "cognitive_distortion" in re.search(r"def build_checklist_prompt\([\s\S]*?\}\n\s*\]\n\}\n\"\"\"\.strip\(\)", src).group(0)
    step4_ok = "if all_filled:" not in src
    step5_ok = "[V6.0 로직 시작]" in src
    print(f"  1. INTAKE_QUESTIONS (9키): {step1_ok}")
    print(f"  2. _CANON_KEYS (9키): {step2_ok}")
    print(f"  3. build_checklist_prompt (11키): {step3_ok}")
    print(f"  4. if all_filled 삭제: {step4_ok}")
    print(f"  5. 메인 로직 (v6.0) 교체: {step5_ok}")

sys.exit(0)
