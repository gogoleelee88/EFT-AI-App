"""정규화 재현 테스트

다양한 변형된 감정 문자열이 정규화 후 올바르게 매칭되는지 검증.
"""

import sys
sys.path.insert(0, ".")

from backend.utils.text_norm import normalize_text
from backend.utils.action_builder import NEGATIVE_EMOTIONS


print("=" * 60)
print("정규화 테스트: 다양한 변형이 NEGATIVE_EMOTIONS에 매칭되는지 확인")
print("=" * 60)

samples = [
    ("정상", "불안"),
    ("Zero-width space", "불안\u200b"),
    ("BOM", "\ufeff불안"),
    ("공백", "  불안  "),
    ("대소문자(영문)", "anxiety"),
    ("대소문자(영문 혼합)", "AnXiEtY"),
    ("일상 표현", "외로워"),
    ("일상 표현2", "불안해"),
]

all_passed = True

for desc, s in samples:
    ns = normalize_text(s)
    in_set = ns in NEGATIVE_EMOTIONS
    status = "[PASS]" if in_set else "[FAIL]"

    print(f"{status} | {desc:20s} | raw={repr(s):30s} | norm={repr(ns):15s} | in_set={in_set}")

    if not in_set:
        all_passed = False

print("=" * 60)
if all_passed:
    print("[SUCCESS] All tests passed!")
    sys.exit(0)
else:
    print("[FAILED] Some tests failed")
    sys.exit(1)
