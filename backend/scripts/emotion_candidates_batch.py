import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx


ENGINE_CONFIG = {
    "a": {
        "endpoint": "http://localhost:8001/v1/chat/completions",
        "model": "engine-a",
    },
    "b": {
        "endpoint": "http://localhost:8002/v1/chat/completions",
        "model": "engine-b",
    },
}

SYSTEM_PROMPT = """
너는 감정 후보를 제안하는 도우미다.

[역할]
- 사용자의 원문 input과 STRICT6 JSON(output)을 보고, "후보 감정" 상위 3개를 추천한다.
- 이 단계는 최종 진단이 아니라, UI에서 사용자가 고를 수 있도록 후보를 제안하는 용도다.

[감정 라벨 세트]
다음 리스트 안에서만 감정을 고른다(반드시 이 중 하나로만 label을 작성):

["불안", "걱정", "긴장", "공포", "압박감", "불확실감", "촉박감", "실수공포", "비교스트레스",
 "분노", "짜증", "억울함", "원망", "무시당함", "경시폄하감", "통제상실감",
 "수치심", "자괴감", "자기혐오", "후회", "죄책감", "자기비난", "무가치감",
 "혼란", "압도감", "멍함",
 "피로감", "무기력", "번아웃", "허탈감", "허무감", "탈의미감",
 "복합/잘모르겠음"]

[출력 형식]
반드시 아래 JSON 형식으로만 출력한다(설명 문장 금지):

{
  "candidates": [
    {"label": "<감정라벨>", "reason": "<이 라벨을 고른 이유>", "confidence": 0.0},
    {"label": "<감정라벨>", "reason": "<이 라벨을 고른 이유>", "confidence": 0.0},
    {"label": "<감정라벨>", "reason": "<이 라벨을 고른 이유>", "confidence": 0.0}
  ]
}

- confidence는 0.0~1.0 사이 숫자로, 모델이 느끼는 상대적 확신 정도를 쓴다.
- reason은 1~2문장으로 간단히 쓴다.
- 출력은 반드시 위 JSON 한 덩어리만 반환하고, 그 외의 자연어 문장은 절대 섞지 않는다.
"""


def is_null_core_emotion(record: Dict[str, Any]) -> bool:
    """core_emotion 이 null/빈값인 경우만 True."""
    try:
        ce = record.get("output", {}).get("core_emotion", None)
    except AttributeError:
        return False

    if ce is None:
        return True

    if isinstance(ce, str) and ce.strip().lower() in ("", "null", "none"):
        return True

    return False


def build_user_content(user_input: str, output_json: Dict[str, Any]) -> str:
    """프롬프트에 넣을 user content 생성."""
    return (
        "아래는 사용자의 감정 관련 입력과 STRICT6 JSON이다.\n"
        "이를 바탕으로 감정 후보를 3개 추천해줘.\n\n"
        "[input]\n"
        f"{user_input}\n\n"
        "[STRICT6 JSON]\n"
        f"{json.dumps(output_json, ensure_ascii=False, indent=2)}\n"
    )


async def call_llm(
    client: httpx.AsyncClient,
    user_input: str,
    output_json: Dict[str, Any],
    endpoint: str,
    model: str,
) -> Optional[List[Dict[str, Any]]]:
    """지정한 endpoint/model로 감정 후보 요청하고 candidates 리스트 반환."""
    user_content = build_user_content(user_input, output_json)

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.3,
    }

    resp = await client.post(endpoint, json=payload)
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        sys.stderr.write(f"[WARN] JSON 파싱 실패, raw content: {content[:200]}...\n")
        return None

    candidates = parsed.get("candidates")
    if not isinstance(candidates, list):
        sys.stderr.write(f"[WARN] candidates 필드 없음/비정상: {parsed}\n")
        return None

    return candidates


async def process_file(
    input_path: Path,
    output_path: Path,
    endpoint: str,
    model: str,
    limit: Optional[int] = None,
):
    """input.jsonl 읽어서 null core_emotion에만 emotion_candidates 붙여 output.jsonl로 저장."""
    sys.stderr.write(f"[INFO] 입력 파일: {input_path}\n")
    sys.stderr.write(f"[INFO] 출력 파일: {output_path}\n")
    sys.stderr.write(f"[INFO] LLM endpoint: {endpoint}, model: {model}\n")

    total = 0
    target = 0

    async with httpx.AsyncClient(timeout=60.0) as client, \
            input_path.open("r", encoding="utf-8") as fin, \
            output_path.open("w", encoding="utf-8") as fout:

        for line in fin:
            line = line.strip()
            if not line:
                continue

            total += 1

            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                sys.stderr.write(f"[WARN] JSONL 한 줄 파싱 실패, skip: {line[:200]}...\n")
                continue

            # core_emotion null 이 아니면 그대로 통과
            if not is_null_core_emotion(record):
                fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                continue

            target += 1
            if limit is not None and target > limit:
                # limit 넘어가면 더 이상 LLM 호출 안 하고 그대로 통과
                fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                continue

            user_input = record.get("input", "")
            output_json = record.get("output", {})

            try:
                candidates = await call_llm(
                    client,
                    user_input=user_input,
                    output_json=output_json,
                    endpoint=endpoint,
                    model=model,
                )
            except Exception as e:
                sys.stderr.write(f"[ERROR] LLM 호출 실패: {e}\n")
                fout.write(json.dumps(record, ensure_ascii=False) + "\n")
                continue

            if candidates is not None:
                record["emotion_candidates"] = candidates

            fout.write(json.dumps(record, ensure_ascii=False) + "\n")

    sys.stderr.write(f"[INFO] 총 레코드: {total}, core_emotion null 대상: {target}\n")


def main():
    parser = argparse.ArgumentParser(
        description="core_emotion == null인 레코드에 감정 후보(emotion_candidates)를 붙이는 배치 스크립트"
    )
    parser.add_argument("--input", "-i", required=True, help="입력 JSONL 파일 경로")
    parser.add_argument("--output", "-o", required=True, help="출력 JSONL 파일 경로")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="LLM 호출 최대 개수(테스트용). None이면 전체 대상에 대해 호출.",
    )
    parser.add_argument(
        "--engine",
        choices=["a", "b"],
        default="b",
        help="사용할 엔진 선택 (a=engine-a@8001, b=engine-b@8002)",
    )

    args = parser.parse_args()

    cfg = ENGINE_CONFIG[args.engine]
    input_path = Path(args.input)
    output_path = Path(args.output)

    asyncio.run(
        process_file(
            input_path=input_path,
            output_path=output_path,
            endpoint=cfg["endpoint"],
            model=cfg["model"],
            limit=args.limit,
        )
    )


if __name__ == "__main__":
    main()
