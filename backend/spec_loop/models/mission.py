from __future__ import annotations

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class MissionTemplate(Base):
    """Mission template model."""

    __tablename__ = "mission_templates"

    mission_template_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    micro_action_id = Column(
        Integer,
        ForeignKey("micro_actions.micro_action_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # mission_type: photo | location | time_check
    mission_type = Column(String(32), nullable=False, index=True)
    enabled = Column(Boolean, default=True, nullable=False)

    # mission config (JSON)
    # photo: { requirement, description, ocr_keywords[], objects_required[], verification_method, example_image_url }
    # location: { place_id, place_name, address, gps: {lat, lng, radius}, wifi_ssid, bluetooth_beacon_id, verification_method[] }
    # time_check: { time, check_type[], screen_requirements: {...}, notification_mode }
    config = Column(JSON, nullable=False)

    # success statistics
    success_count = Column(Integer, default=0, nullable=False)
    total_count = Column(Integer, default=0, nullable=False)

    # runtime result state
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_result = Column(String(16), nullable=True)  # success | fail
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<MissionTemplate(id={self.mission_template_id}, type='{self.mission_type}', success_rate={self.success_rate:.2%})>"

    @property
    def success_rate(self) -> float:
        """Success ratio as a float between 0.0 and 1.0."""
        if self.total_count == 0:
            return 0.0
        return self.success_count / self.total_count
