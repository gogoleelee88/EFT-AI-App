"""문자열 정규화 유틸리티

부정적 감정 감지 시 문자열 비교 안정성을 위한 정규화 함수 제공.
- 보이지 않는 문자(Zero-width, BOM, NBSP 등) 제거
- Unicode 정규화(NFKC)
- 공백 제거 및 소문자 변환
"""

import re
import unicodedata
from typing import Any


# Zero-width spaces, BOM, NBSP 등 불가시 문자 패턴
_INVISIBLES = re.compile(r'[\u200B-\u200D\uFEFF\u2060\u00A0]')


def normalize_text(s: Any) -> str:
    """텍스트를 안전하게 정규화

    Args:
        s: 정규화할 값 (Any 타입 허용)

    Returns:
        정규화된 문자열 (소문자, 공백 제거, 불가시 문자 제거, NFKC)

    Examples:
        >>> normalize_text("불안")
        '불안'
        >>> normalize_text("불안\u200b")  # Zero-width space
        '불안'
        >>> normalize_text("  AnXiEtY  ")
        'anxiety'
        >>> normalize_text(None)
        ''
    """
    if s is None:
        return ""

    # 어떤 타입이든 문자열로 변환
    try:
        s = str(s)
    except Exception:
        s = repr(s)

    # 불가시 문자 제거
    s = _INVISIBLES.sub("", s)

    # Unicode 정규화 (NFKC: 호환성 분해 후 정규 결합)
    s = unicodedata.normalize("NFKC", s)

    # 양끝 공백 제거 및 소문자 변환
    s = s.strip().lower()

    return s
