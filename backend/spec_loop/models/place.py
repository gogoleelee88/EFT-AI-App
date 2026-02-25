from __future__ import annotations

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy import JSON

from backend.database import Base


class Place(Base):
    """Place model (GPS / Wi-Fi / Bluetooth beacon metadata)."""

    __tablename__ = "places"

    place_id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # place details
    name = Column(String(256), nullable=False)  # place name
    address = Column(String(512), nullable=True)  # optional address

    # geolocation fields
    gps_lat = Column(Float, nullable=True)  # GPS latitude
    gps_lng = Column(Float, nullable=True)  # GPS longitude
    gps_radius = Column(Integer, default=50, nullable=False)  # radius meters

    wifi_ssid = Column(String(256), nullable=True)  # Wi-Fi SSID
    bluetooth_beacon_id = Column(String(256), nullable=True)  # Bluetooth beacon ID

    # accepted verification methods: ["gps", "wifi", "bluetooth"]
    verification_method = Column(JSON, nullable=True)

    # runtime statistics
    success_count = Column(Integer, default=0, nullable=False)
    total_count = Column(Integer, default=0, nullable=False)

    # last runtime state
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    def __repr__(self):
        return f"<Place(id={self.place_id}, name='{self.name}', success_rate={self.success_rate:.2%})>"

    @property
    def success_rate(self) -> float:
        """Success ratio as a float between 0.0 and 1.0."""
        if self.total_count == 0:
            return 0.0
        return self.success_count / self.total_count
