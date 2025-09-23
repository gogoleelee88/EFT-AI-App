# test_suds_write.py
from datetime import datetime, timezone
from backend.models.suds import SUDSEntry, SUDSType
from backend.services.suds_logger import append_suds, SUDS_FILE

now = datetime.now(timezone.utc).isoformat()
append_suds(SUDSEntry(
    trace_id="dev-smoke-test",
    type=SUDSType.SYSTEM,
    score=4,
    session_id="sess-abc",
    user_id="user-xyz",
    saved_at=now,
    timestamp=now,
))
print("OK ->", SUDS_FILE)