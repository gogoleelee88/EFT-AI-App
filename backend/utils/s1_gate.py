import re
from enum import Enum
from typing import List, Tuple

# ViolationType Enum based on user description
class ViolationType(Enum):
    MULTI_QUESTION = "multi_question"
    PREMATURE_JSON = "premature_json"
    SUDS_EFT_EARLY = "suds_eft_early"
    INTERNAL_MARKER = "internal_marker"
    COMBINED = "combined"

class S1Gate:
    def __init__(self, strict_mode: bool = False):
        self.strict_mode = strict_mode

    def validate(
        self,
        ai_response: str,
        intake_count: int,
        turn_count: int,
        user_message: str
    ) -> Tuple[bool, List[ViolationType], str]:
        """
        Validates the AI response against S1 Gate rules.
        """
        violations = []
        details = []

        # 1. Multi-question check
        # Simplified: more than 2 question marks is a violation.
        if ai_response.count('?') > 2:
            violations.append(ViolationType.MULTI_QUESTION)
            details.append(f"Too many questions ({ai_response.count('?')})")

        # 2. Premature JSON check
        # Simplified: starts with { but doesn't end with }
        stripped_response = ai_response.strip()
        if stripped_response.startswith('{') and not stripped_response.endswith('}'):
            violations.append(ViolationType.PREMATURE_JSON)
            details.append("Incomplete JSON detected")

        # 3. SUDS/EFT early mention check
        # Simplified: mentioned before intake_count reaches 2
        if intake_count < 2:
            if re.search(r'\b(SUDS|EFT)\b', ai_response, re.IGNORECASE):
                violations.append(ViolationType.SUDS_EFT_EARLY)
                details.append("SUDS/EFT mentioned too early in the conversation")

        # 4. Internal marker check
        # Simplified: checks for common internal-looking markers
        if '<<' in ai_response or '>>' in ai_response or '[S1_GATE' in ai_response:
            violations.append(ViolationType.INTERNAL_MARKER)
            details.append("Internal marker detected in response")

        # 5. Combined violation
        if len(violations) > 1:
            violations.append(ViolationType.COMBINED)
            details.append("Multiple violations detected")
            
        is_valid = not violations
        detail_msg = ", ".join(details) if details else "Validation passed"

        return is_valid, violations, detail_msg

def get_s1_gate(strict_mode: bool = False) -> S1Gate:
    """
    Factory function to get an S1Gate instance.
    """
    return S1Gate(strict_mode=strict_mode)
