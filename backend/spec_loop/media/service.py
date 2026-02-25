from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.spec_loop.models import MediaJob


def create_media_job(
    db: Session,
    kind: str,
    input_refs: Optional[list[dict[str, Any]]] = None,
    *,
    status: str = "pending",
    output_url: Optional[str] = None,
) -> MediaJob:
    """
    SPEC C3 / Slice 6:
    ê·ì¹ ê¸°ë° ìµì ?´ë?ì§/?ì ?ì± stub.

    - kind: \"img\" ?ë \"vid\" (API ê³ì½ ???ëë§?ë³´ì¥).
    - DB??media_jobs ?ì½?ë? ?ì±?ê³ ë°í?ë¤.
    - ?¤ì ëª¨ë¸ ?¸ì¶/?ëë§ì? ?´í Slice?ì ?ì¥?ë¤.
    """
    job = MediaJob(
        kind=kind,
        status=status,
        input_refs=input_refs or [],
        output_url=output_url,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


