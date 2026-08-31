from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class StudyTask(Base):
    __tablename__ = "study_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_date: Mapped[date] = mapped_column(Date, index=True)
    subject: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160))
    minutes: Mapped[int] = mapped_column(Integer, default=20)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    template_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(160))
    minutes: Mapped[int] = mapped_column(Integer, default=20)
    weekdays: Mapped[str] = mapped_column(String(20), default="0,1,2,3,4,5,6")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WrongQuestion(Base):
    __tablename__ = "wrong_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160), default="拍照录入的错题")
    image_path: Mapped[str] = mapped_column(String(500), default="")
    cause: Mapped[str] = mapped_column(String(120), default="待确认")
    knowledge_point: Mapped[str] = mapped_column(String(160), default="待确认")
    ai_summary: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[str] = mapped_column(String(20), default="待复习")
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    next_review_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ExamScore(Base):
    __tablename__ = "exam_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    exam_name: Mapped[str] = mapped_column(String(120))
    exam_date: Mapped[date] = mapped_column(Date)
    subject: Mapped[str] = mapped_column(String(20), index=True)
    score: Mapped[int] = mapped_column(Integer)
    full_score: Mapped[int] = mapped_column(Integer)


class FocusRecord(Base):
    __tablename__ = "focus_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    subject: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    planned_seconds: Mapped[int] = mapped_column(Integer, default=0)
    actual_seconds: Mapped[int] = mapped_column(Integer, default=0)
    pomodoros_completed: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(256))
    role: Mapped[str] = mapped_column(String(20), default="student")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    password_changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AiChatMessage(Base):
    __tablename__ = "ai_chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(20), index=True)
    question: Mapped[str] = mapped_column(Text)
    student_thought: Mapped[str] = mapped_column(Text, default="")
    answer: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(80), default="")
    provider: Mapped[str] = mapped_column(String(40), default="minimax")
    demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class WeeklyReport(Base):
    __tablename__ = "weekly_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    week_start: Mapped[date] = mapped_column(Date, index=True)
    week_end: Mapped[date] = mapped_column(Date)
    completion_rate: Mapped[int] = mapped_column(Integer, default=0)
    total_focus_minutes: Mapped[int] = mapped_column(Integer, default=0)
    total_pomodoros: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    mastered_count: Mapped[int] = mapped_column(Integer, default=0)
    schema_version: Mapped[int] = mapped_column(Integer, default=2)
    generated_by_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    highlights: Mapped[str] = mapped_column(Text, default="")
    weaknesses: Mapped[str] = mapped_column(Text, default="")
    action_plan: Mapped[str] = mapped_column(Text, default="")
    parent_advice: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
