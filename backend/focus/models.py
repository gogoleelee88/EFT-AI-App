from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)

from backend.database import Base


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    type = Column(String(32), nullable=False)  # web | extension | mobile | watch
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    task_title = Column(String(255), nullable=False)
    goal = Column(Text, nullable=False)
    timer_mode = Column(String(16), nullable=False)  # pomodoro | free
    duration = Column(Integer, nullable=True)
    status = Column(String(32), nullable=False, default="working")
    next_step = Column(Text, nullable=True)
    sensors_enabled = Column(JSON, nullable=True)
    planned_break = Column(Boolean, nullable=False, default=False)


class SessionState(Base):
    __tablename__ = "session_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    ts = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    state = Column(String(32), nullable=False)
    exit_score = Column(Float, nullable=False)
    evidence = Column(JSON, nullable=True)


class Event(Base):
    __tablename__ = "events"

    id = Column(String(64), primary_key=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    device_id = Column(String(64), ForeignKey("devices.id", ondelete="SET NULL"), nullable=True, index=True)
    ts = Column(DateTime(timezone=True), nullable=False, index=True)
    source = Column(String(16), nullable=False)
    type = Column(String(32), nullable=False)
    payload = Column(JSON, nullable=False)


class Interruption(Base):
    __tablename__ = "interruptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    ts_start = Column(DateTime(timezone=True), nullable=False, index=True)
    ts_end = Column(DateTime(timezone=True), nullable=True)
    interruption_type = Column(String(16), nullable=False)  # break | meeting | stuck
    detected = Column(Boolean, nullable=False, default=False)
    user_labeled = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)


class StuckCase(Base):
    __tablename__ = "stuck_cases"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(64), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    stuck_text = Column(Text, nullable=False)
    desired_output = Column(Text, nullable=False)
    constraints = Column(Text, nullable=True)
    detected_category = Column(String(64), nullable=False)
    model_profile = Column(String(32), nullable=False)
    prompt_text = Column(Text, nullable=False)
    ai_result = Column(JSON, nullable=True)
    next_actions = Column(JSON, nullable=True)


class UserSetting(Base):
    __tablename__ = "user_settings"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    idle_threshold_seconds = Column(Integer, nullable=False, default=180)
    camera_enabled = Column(Boolean, nullable=False, default=False)
    camera_weight = Column(Float, nullable=False, default=3.0)
    window_size_seconds = Column(Integer, nullable=False, default=600)
    notification_prefs = Column(JSON, nullable=True)
    data_retention_days = Column(Integer, nullable=False, default=60)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


Index("ix_events_session_ts_desc", Event.session_id, Event.ts.desc())
Index("ix_session_states_session_ts_desc", SessionState.session_id, SessionState.ts.desc())
Index("ix_interruptions_session_start_desc", Interruption.session_id, Interruption.ts_start.desc())
Index("ix_stuck_cases_session_created_desc", StuckCase.session_id, StuckCase.created_at.desc())


