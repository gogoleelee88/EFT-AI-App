# MissionResult 紐⑤뜽 - 誘몄뀡 ?섑뻾 寃곌낵 ???
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class MissionResult(Base):
    """誘몄뀡 ?섑뻾 寃곌낵 - ?뚮엺 ?댁젣 寃利앹슜"""

    __tablename__ = "mission_results"

    result_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    day_id = Column(
        Integer, ForeignKey("day_plans.day_id", ondelete="CASCADE"), nullable=False, index=True
    )
    mission_template_id = Column(
        Integer,
        ForeignKey("mission_templates.mission_template_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # 誘몄뀡 ?뺣낫
    mission_type = Column(String(32), nullable=False, index=True)  # photo | location | time_check

    # 寃利?寃곌낵
    passed = Column(Boolean, nullable=False)  # ?듦낵 ?щ?
    score = Column(Float, nullable=True)  # ?좊ː???먯닔 (0.0~1.0)

    # 寃利?利앷굅 (JSON)
    # photo: { image_url, ocr_result[], detected_objects[], confidence }
    # location: { gps: {lat, lng, distance_m}, wifi_matched, bluetooth_matched }
    # time_check: { screenshot_url, app_detected, file_opened, file_modified_at }
    evidence = Column(JSON, nullable=True)

    # 硫뷀??곗씠??
    attempted_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        status = "???듦낵" if self.passed else "???ㅽ뙣"
        return f"<MissionResult(id={self.result_id}, type='{self.mission_type}', {status})>"


