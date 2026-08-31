from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    title: str
    minutes: int
    completed: bool


class SubjectSummary(BaseModel):
    subject: str
    status: str
    pending_count: int
    accent: str


class DashboardOut(BaseModel):
    date: date
    planned_minutes: int
    completed_minutes: int
    tasks: list[TaskOut]
    subjects: list[SubjectSummary]
    high_frequency_cause: str
    pending_reviews: int
    due_reviews: int
    today_focus_minutes: int


class WrongQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    title: str
    cause: str
    knowledge_point: str
    ai_summary: str
    review_status: str
    review_count: int
    next_review_date: date | None
    created_at: datetime


class ScoreCreate(BaseModel):
    exam_name: str = Field(min_length=1, max_length=120)
    exam_date: date
    subject: str
    score: int = Field(ge=0)
    full_score: int = Field(gt=0)


class ScoreOut(ScoreCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int


class AiCoachRequest(BaseModel):
    subject: str
    question: str = Field(min_length=2, max_length=6000)
    student_thought: str = Field(default="", max_length=6000)


class AiCoachResponse(BaseModel):
    provider: str
    model: str
    demo: bool
    answer: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: str


class TaskCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=160)
    minutes: int = Field(ge=5, le=120, default=20)
    task_date: date | None = None  # defaults to today in the endpoint


class TaskUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=20)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    minutes: int | None = Field(default=None, ge=5, le=120)


class WrongQuestionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    cause: str | None = Field(default=None, min_length=1, max_length=120)
    knowledge_point: str | None = Field(default=None, min_length=1, max_length=160)
    review_status: str | None = Field(default=None, pattern=r"^(待复习|已复习|已掌握)$")


# ── Task Templates ──

class TemplateCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=160)
    minutes: int = Field(ge=5, le=120, default=20)
    weekdays: str = Field(default="0,1,2,3,4,5,6", pattern=r"^[0-6](,[0-6])*$")


class TemplateUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=20)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    minutes: int | None = Field(default=None, ge=5, le=120)
    weekdays: str | None = Field(default=None, pattern=r"^[0-6](,[0-6])*$")
    active: bool | None = None


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    title: str
    minutes: int
    weekdays: str
    active: bool
    sort_order: int


# ── Focus Records ──

class FocusRecordCreate(BaseModel):
    task_id: int | None = None
    subject: str = Field(min_length=1, max_length=20)
    title: str = Field(default="", max_length=160)
    planned_seconds: int = Field(ge=0, le=8 * 60 * 60)
    actual_seconds: int = Field(ge=0, le=8 * 60 * 60)
    pomodoros_completed: int = Field(ge=0, le=32, default=0)


class FocusRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int | None
    subject: str
    title: str
    planned_seconds: int
    actual_seconds: int
    pomodoros_completed: int
    started_at: datetime


class FocusStatsOut(BaseModel):
    today_minutes: int
    today_pomodoros: int
    week_minutes: int
    week_pomodoros: int
    subject_minutes: dict[str, int]


# ── Score Trend ──

class ScoreTrendPoint(BaseModel):
    exam_name: str
    exam_date: date
    subject: str
    score: int
    full_score: int
    percent: int


# ── AI Chat History ──

class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    question: str
    student_thought: str
    answer: str
    model: str
    provider: str
    demo: bool
    created_at: datetime


# ── Weekly Learning Report ──

class WeeklyReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    week_start: date
    week_end: date
    completion_rate: int
    total_planned_tasks: int
    total_completed_tasks: int
    total_focus_minutes: int
    total_pomodoros: int
    wrong_count: int
    mastered_count: int
    frequent_cause: str
    weak_subjects: list[str]
    data_sufficient: bool
    generated_by_ai: bool
    highlights: str
    weaknesses: str
    action_plan: str
    parent_advice: str
    created_at: datetime
