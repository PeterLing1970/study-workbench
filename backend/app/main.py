from collections import Counter
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .ai import AiUnavailable, analyze_wrong_question, demo_coach_answer, request_chat
from .auth import clear_session_cookie, ensure_auth_users, ensure_feature_schema, ensure_user_role_schema, login, require_student, require_user
from .config import get_settings
from .database import Base, SessionLocal, engine, get_db
from .models import AiChatMessage, ExamScore, FocusRecord, StudyTask, TaskTemplate, User, WeeklyReport, WrongQuestion
from .schemas import (
    AiCoachRequest,
    AiCoachResponse,
    ChatMessageOut,
    DashboardOut,
    FocusRecordCreate,
    FocusRecordOut,
    FocusStatsOut,
    LoginRequest,
    ScoreCreate,
    ScoreOut,
    ScoreTrendPoint,
    SubjectSummary,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
    UserOut,
    WeeklyReportOut,
    WrongQuestionOut,
    WrongQuestionUpdate,
)
from .seed import SUBJECT_FULL_SCORES, seed_demo_data


EBBINGHAUS_INTERVALS = [1, 3, 7, 15, 30]

settings = get_settings()


def generate_tasks_from_templates(db: Session, target_date: date) -> None:
    """Generate today's tasks from active templates if not already created for today."""
    weekday = str(target_date.weekday())
    templates = list(db.scalars(
        select(TaskTemplate)
        .where(TaskTemplate.active.is_(True))
        .order_by(TaskTemplate.sort_order, TaskTemplate.id)
    ))
    existing_template_ids = set(
        db.scalars(
            select(StudyTask.template_id)
            .where(StudyTask.task_date == target_date, StudyTask.template_id.is_not(None))
        )
    )
    tasks = [
        StudyTask(
            task_date=target_date,
            subject=t.subject,
            title=t.title,
            minutes=t.minutes,
            sort_order=t.sort_order,
            template_id=t.id,
        )
        for t in templates
        if weekday in t.weekdays.split(",") and t.id not in existing_template_ids
    ]
    if tasks:
        db.add_all(tasks)
        db.commit()


def compute_next_review(review_count: int) -> date:
    """Return next review date based on Ebbinghaus spaced repetition."""
    idx = min(max(review_count - 1, 0), len(EBBINGHAUS_INTERVALS) - 1)
    return date.today() + timedelta(days=EBBINGHAUS_INTERVALS[idx])


def has_valid_image_signature(content: bytes, content_type: str) -> bool:
    signatures = {
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }
    return signatures.get(content_type, False)


@dataclass(frozen=True)
class WeeklyStats:
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


def collect_weekly_stats(db: Session, today: date | None = None) -> WeeklyStats:
    """Collect only real records for the current week; zero is a valid value."""
    current_day = today or date.today()
    week_start = current_day - timedelta(days=current_day.weekday())
    week_end = week_start + timedelta(days=6)
    week_start_dt = datetime(week_start.year, week_start.month, week_start.day)
    next_week_dt = week_start_dt + timedelta(days=7)

    tasks = list(db.scalars(
        select(StudyTask).where(StudyTask.task_date >= week_start, StudyTask.task_date <= week_end)
    ))
    total_planned_tasks = len(tasks)
    total_completed_tasks = sum(1 for task in tasks if task.completed)
    completion_rate = round(total_completed_tasks / total_planned_tasks * 100) if total_planned_tasks else 0

    focus_totals = db.execute(
        select(
            func.coalesce(func.sum(FocusRecord.actual_seconds), 0),
            func.coalesce(func.sum(FocusRecord.pomodoros_completed), 0),
            func.count(FocusRecord.id),
        ).where(FocusRecord.started_at >= week_start_dt, FocusRecord.started_at < next_week_dt)
    ).one()
    total_focus_minutes = int(focus_totals[0]) // 60
    total_pomodoros = int(focus_totals[1])
    focus_record_count = int(focus_totals[2])

    weekly_wrong_questions = list(db.scalars(
        select(WrongQuestion).where(
            WrongQuestion.created_at >= week_start_dt,
            WrongQuestion.created_at < next_week_dt,
        )
    ))
    wrong_count = len(weekly_wrong_questions)
    mastered_count = sum(1 for item in weekly_wrong_questions if item.review_status == "已掌握")
    causes = [item.cause for item in weekly_wrong_questions if item.cause]
    frequent_cause = Counter(causes).most_common(1)[0][0] if causes else "暂无"

    score_rows = list(db.scalars(select(ExamScore).order_by(desc(ExamScore.exam_date), desc(ExamScore.id))))
    weak_subjects: list[str] = []
    if score_rows:
        latest_exam = (score_rows[0].exam_date, score_rows[0].exam_name)
        latest_rows = [row for row in score_rows if (row.exam_date, row.exam_name) == latest_exam]
        weak_subjects = [
            row.subject for row in latest_rows
            if row.full_score and (row.score / row.full_score) < 0.8
        ]

    return WeeklyStats(
        week_start=week_start,
        week_end=week_end,
        completion_rate=completion_rate,
        total_planned_tasks=total_planned_tasks,
        total_completed_tasks=total_completed_tasks,
        total_focus_minutes=total_focus_minutes,
        total_pomodoros=total_pomodoros,
        wrong_count=wrong_count,
        mastered_count=mastered_count,
        frequent_cause=frequent_cause,
        weak_subjects=weak_subjects,
        data_sufficient=bool(tasks or focus_record_count or weekly_wrong_questions or score_rows),
    )


def default_weekly_narrative(stats: WeeklyStats) -> tuple[str, str, str, str]:
    if not stats.data_sufficient:
        return (
            "本周尚无足够的学习记录，系统不会使用演示数字代替真实数据。",
            "暂无可判断的薄弱项；完成任务、专注学习或录入成绩后再生成诊断。",
            "先完成一项今日任务，并记录一次真实专注时长，逐步形成可分析的数据。",
            "本周数据不足时，以陪伴孩子建立记录习惯为主，不根据空数据做评价。",
        )

    weak_text = "、".join(stats.weak_subjects) if stats.weak_subjects else "暂无明显弱科"
    highlights = (
        f"本周完成 {stats.total_completed_tasks}/{stats.total_planned_tasks} 项任务，"
        f"累计专注 {stats.total_focus_minutes} 分钟，完成 {stats.total_pomodoros} 个番茄钟。"
    )
    weaknesses = (
        f"最近一次考试的薄弱学科为：{weak_text}。"
        f"本周错题高频错因为「{stats.frequent_cause}」。"
    )
    action_plan = (
        "下周继续记录真实任务与专注时长；"
        + (f"优先安排 {stats.weak_subjects[0]} 的专题巩固。" if stats.weak_subjects else "保持当前节奏，并及时整理新错题。")
    )
    parent_advice = "建议关注孩子是否形成稳定的学习记录和复习节奏，肯定真实投入，不以单周数字作过度评价。"
    return highlights, weaknesses, action_plan, parent_advice


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_user_role_schema(engine)
    ensure_feature_schema(engine)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        ensure_auth_users(db, settings)
        seed_demo_data(db)
        generate_tasks_from_templates(db, date.today())
    yield


trusted_origins = {origin.strip().rstrip("/") for origin in settings.trusted_origins.split(",") if origin.strip()}

app = FastAPI(title=settings.app_name, version="0.4.1", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(trusted_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def enforce_trusted_origin(request: Request, call_next):
    """Reject cross-origin browser writes while allowing same-origin and non-browser clients."""
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin", "").rstrip("/")
        if origin:
            forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
            current_origin = f"{forwarded_proto}://{request.headers.get('host', request.url.netloc)}".rstrip("/")
            if origin not in trusted_origins and origin != current_origin:
                return JSONResponse(status_code=403, content={"detail": "不允许跨站提交请求"})
    return await call_next(request)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=UserOut)
def auth_login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> UserOut:
    return login(request, response, payload, db, settings)


@app.post("/api/auth/logout", status_code=204, response_class=Response)
def auth_logout(response: Response) -> Response:
    clear_session_cookie(response, settings)
    response.status_code = 204
    return response


@app.get("/api/auth/me", response_model=UserOut)
def auth_me(current_user: User = Depends(require_user)) -> UserOut:
    return UserOut.model_validate(current_user)


# ── Dashboard ──

@app.get("/api/dashboard", response_model=DashboardOut)
def dashboard(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> DashboardOut:
    today = date.today()
    generate_tasks_from_templates(db, today)
    tasks = list(
        db.scalars(
            select(StudyTask).where(StudyTask.task_date == today).order_by(StudyTask.sort_order, StudyTask.id)
        )
    )
    if not tasks:
        seed_demo_data(db)
        tasks = list(db.scalars(select(StudyTask).order_by(desc(StudyTask.task_date), StudyTask.sort_order).limit(3)))

    planned_minutes = sum(task.minutes for task in tasks)
    completed_minutes = sum(task.minutes for task in tasks if task.completed)
    pending_by_subject = Counter(task.subject for task in tasks if not task.completed)
    status_colors = {"语文": "amber", "数学": "blue", "英语": "green", "物理": "slate", "化学": "purple", "道法": "red", "历史": "orange"}
    subject_set = {task.subject for task in tasks}
    subject_rows = [
        SubjectSummary(
            subject=subject,
            pending_count=pending_by_subject.get(subject, 0),
            status="已完成" if pending_by_subject.get(subject, 0) == 0 else "待完成" if subject != "物理" else "待复习",
            accent=status_colors.get(subject, "slate"),
        )
        for subject in ("语文", "数学", "英语", "物理", "化学", "道法", "历史")
        if subject in subject_set
    ]
    causes = list(db.scalars(select(WrongQuestion.cause)))
    frequent_cause = Counter(causes).most_common(1)[0][0] if causes else "暂无"
    pending_reviews = db.query(WrongQuestion).filter(WrongQuestion.review_status != "已掌握").count()
    due_reviews = db.query(WrongQuestion).filter(
        WrongQuestion.review_status != "已掌握",
        WrongQuestion.next_review_date <= today,
    ).count()

    # Today's focus minutes
    today_start = datetime(today.year, today.month, today.day)
    today_focus_seconds = db.scalar(
        select(func.coalesce(func.sum(FocusRecord.actual_seconds), 0))
        .where(FocusRecord.started_at >= today_start)
    ) or 0

    return DashboardOut(
        date=today,
        planned_minutes=planned_minutes,
        completed_minutes=completed_minutes,
        tasks=[TaskOut.model_validate(task) for task in tasks],
        subjects=subject_rows,
        high_frequency_cause=frequent_cause,
        pending_reviews=pending_reviews,
        due_reviews=due_reviews,
        today_focus_minutes=today_focus_seconds // 60,
    )


# ── Tasks ──

@app.patch("/api/tasks/{task_id}/toggle", response_model=TaskOut)
def toggle_task(
    task_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> StudyTask:
    task = db.get(StudyTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    task.completed = not task.completed
    db.commit()
    db.refresh(task)
    return task


@app.post("/api/tasks", response_model=TaskOut, status_code=201)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> StudyTask:
    task_date = payload.task_date or date.today()
    max_order = db.query(StudyTask.sort_order).filter(StudyTask.task_date == task_date).order_by(desc(StudyTask.sort_order)).first()
    next_order = (max_order[0] + 1) if max_order else 0
    task = StudyTask(
        task_date=task_date,
        subject=payload.subject,
        title=payload.title,
        minutes=payload.minutes,
        sort_order=next_order,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@app.put("/api/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> StudyTask:
    task = db.get(StudyTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    db.commit()
    db.refresh(task)
    return task


@app.delete("/api/tasks/{task_id}", status_code=204, response_class=Response)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> Response:
    task = db.get(StudyTask, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    db.delete(task)
    db.commit()
    return Response(status_code=204)


# ── Task Templates ──

@app.get("/api/templates", response_model=list[TemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[TaskTemplate]:
    return list(db.scalars(select(TaskTemplate).order_by(TaskTemplate.sort_order, TaskTemplate.id)))


@app.post("/api/templates", response_model=TemplateOut, status_code=201)
def create_template(
    payload: TemplateCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> TaskTemplate:
    max_order = db.query(TaskTemplate.sort_order).order_by(desc(TaskTemplate.sort_order)).first()
    next_order = (max_order[0] + 1) if max_order else 0
    template = TaskTemplate(
        subject=payload.subject,
        title=payload.title,
        minutes=payload.minutes,
        weekdays=payload.weekdays,
        sort_order=next_order,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@app.put("/api/templates/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> TaskTemplate:
    template = db.get(TaskTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)
    db.commit()
    db.refresh(template)
    return template


@app.delete("/api/templates/{template_id}", status_code=204, response_class=Response)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> Response:
    template = db.get(TaskTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="模板不存在")
    db.delete(template)
    db.commit()
    return Response(status_code=204)


# ── Wrong Questions ──

@app.get("/api/wrong-questions", response_model=list[WrongQuestionOut])
def wrong_questions(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[WrongQuestion]:
    return list(db.scalars(select(WrongQuestion).order_by(desc(WrongQuestion.created_at)).limit(100)))


@app.patch("/api/wrong-questions/{wq_id}", response_model=WrongQuestionOut)
def update_wrong_question(
    wq_id: int,
    payload: WrongQuestionUpdate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> WrongQuestion:
    wq = db.get(WrongQuestion, wq_id)
    if wq is None:
        raise HTTPException(status_code=404, detail="错题不存在")

    data = payload.model_dump(exclude_unset=True)
    new_status = data.get("review_status")

    if new_status and new_status != wq.review_status:
        if new_status == "已复习":
            wq.review_count += 1
            wq.next_review_date = compute_next_review(wq.review_count)
        elif new_status == "已掌握":
            wq.next_review_date = None
        elif new_status == "待复习":
            wq.next_review_date = date.today()

    for field, value in data.items():
        setattr(wq, field, value)
    db.commit()
    db.refresh(wq)
    return wq


@app.delete("/api/wrong-questions/{wq_id}", status_code=204, response_class=Response)
def delete_wrong_question(
    wq_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> Response:
    wq = db.get(WrongQuestion, wq_id)
    if wq is None:
        raise HTTPException(status_code=404, detail="错题不存在")
    db.delete(wq)
    db.commit()
    return Response(status_code=204)


@app.get("/api/wrong-questions/due", response_model=list[WrongQuestionOut])
def due_wrong_questions(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[WrongQuestion]:
    """Return wrong questions due for review today or overdue."""
    today = date.today()
    return list(db.scalars(
        select(WrongQuestion)
        .where(WrongQuestion.review_status != "已掌握", WrongQuestion.next_review_date <= today)
        .order_by(WrongQuestion.next_review_date)
        .limit(50)
    ))


@app.post("/api/wrong-questions/analyze")
async def create_wrong_question(
    subject: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> dict:
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    if image.content_type not in allowed:
        raise HTTPException(status_code=415, detail="只支持 JPG、PNG 或 WEBP 图片")
    content = await image.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"图片不能超过 {settings.max_upload_mb}MB")
    if not has_valid_image_signature(content, image.content_type):
        raise HTTPException(status_code=415, detail="图片内容与文件格式不匹配")

    destination = Path(settings.upload_dir) / f"{uuid4().hex}{allowed[image.content_type]}"
    destination.write_bytes(content)
    demo = False
    provider = "demo"
    model = "not-configured"
    try:
        analysis, provider, model = await analyze_wrong_question(settings, destination, image.content_type, subject)
    except AiUnavailable:
        demo = True
        analysis = {
            "title": f"{subject}拍照错题",
            "knowledge_point": "待人工确认",
            "cause": "计算步骤",
            "summary": "图片已保存。配置 MiniMax API 后会自动识别题目、知识点和错因。",
        }

    item = WrongQuestion(
        subject=subject,
        title=analysis["title"] or f"{subject}拍照错题",
        image_path=str(destination),
        cause=analysis["cause"] or "待确认",
        knowledge_point=analysis["knowledge_point"] or "待确认",
        ai_summary=analysis["summary"],
        next_review_date=date.today() + timedelta(days=1),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "item": WrongQuestionOut.model_validate(item),
        "provider": provider,
        "model": model,
        "demo": demo,
    }


# ── Scores ──

@app.get("/api/scores", response_model=list[ScoreOut])
def scores(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[ExamScore]:
    return list(db.scalars(select(ExamScore).order_by(desc(ExamScore.exam_date), ExamScore.subject)))


@app.post("/api/scores", response_model=ScoreOut)
def add_score(
    payload: ScoreCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> ExamScore:
    expected_full_score = SUBJECT_FULL_SCORES.get(payload.subject)
    if expected_full_score is None:
        raise HTTPException(status_code=400, detail="未知科目")
    if payload.full_score != expected_full_score:
        raise HTTPException(status_code=400, detail=f"{payload.subject}满分应为 {expected_full_score}")
    if payload.score > payload.full_score:
        raise HTTPException(status_code=400, detail="成绩不能超过满分")
    score = ExamScore(**payload.model_dump())
    db.add(score)
    db.commit()
    db.refresh(score)
    return score


@app.get("/api/scores/trend", response_model=list[ScoreTrendPoint])
def score_trend(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[ScoreTrendPoint]:
    """Return all scores as trend points for charting."""
    rows = list(db.scalars(select(ExamScore).order_by(ExamScore.exam_date, ExamScore.subject)))
    return [
        ScoreTrendPoint(
            exam_name=s.exam_name,
            exam_date=s.exam_date,
            subject=s.subject,
            score=s.score,
            full_score=s.full_score,
            percent=round(s.score / s.full_score * 100) if s.full_score else 0,
        )
        for s in rows
    ]


# ── Focus Records ──

@app.post("/api/focus-records", response_model=FocusRecordOut, status_code=201)
def create_focus_record(
    payload: FocusRecordCreate,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> FocusRecord:
    record = FocusRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@app.get("/api/focus-records/stats", response_model=FocusStatsOut)
def focus_stats(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> FocusStatsOut:
    today = date.today()
    today_start = datetime(today.year, today.month, today.day)
    week_start = today_start - timedelta(days=today.weekday())

    today_seconds = db.scalar(
        select(func.coalesce(func.sum(FocusRecord.actual_seconds), 0))
        .where(FocusRecord.started_at >= today_start)
    ) or 0
    today_pomodoros = db.scalar(
        select(func.coalesce(func.sum(FocusRecord.pomodoros_completed), 0))
        .where(FocusRecord.started_at >= today_start)
    ) or 0

    week_seconds = db.scalar(
        select(func.coalesce(func.sum(FocusRecord.actual_seconds), 0))
        .where(FocusRecord.started_at >= week_start)
    ) or 0
    week_pomodoros = db.scalar(
        select(func.coalesce(func.sum(FocusRecord.pomodoros_completed), 0))
        .where(FocusRecord.started_at >= week_start)
    ) or 0

    # Per-subject breakdown this week
    subject_rows = db.execute(
        select(FocusRecord.subject, func.sum(FocusRecord.actual_seconds))
        .where(FocusRecord.started_at >= week_start)
        .group_by(FocusRecord.subject)
    ).all()
    subject_minutes = {row[0]: row[1] // 60 for row in subject_rows}

    return FocusStatsOut(
        today_minutes=today_seconds // 60,
        today_pomodoros=today_pomodoros,
        week_minutes=week_seconds // 60,
        week_pomodoros=week_pomodoros,
        subject_minutes=subject_minutes,
    )


# ── AI Coach & Chat History ──

@app.post("/api/ai/coach", response_model=AiCoachResponse)
async def ai_coach(
    payload: AiCoachRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> AiCoachResponse:
    system_prompt = (
        "你是初三学习辅导助手。采用分级提示：先指出知识点，再给方法提示和关键步骤。"
        "除非学生明确要求并已经展示思路，否则不要直接给最终答案。表达简洁、鼓励但不夸张。"
    )
    user_prompt = f"科目：{payload.subject}\n题目：{payload.question}\n学生思路：{payload.student_thought or '未填写'}"
    provider = "minimax"
    model = "MiniMax-M3"
    demo = False
    try:
        answer, provider, model = await request_chat(
            settings,
            system_prompt,
            user_prompt,
            reasoning=payload.subject in {"数学", "物理", "化学"},
        )
    except AiUnavailable:
        demo = True
        provider = "demo"
        model = "not-configured"
        answer = demo_coach_answer(payload.subject)

    # Persist chat message
    chat_record = AiChatMessage(
        subject=payload.subject,
        question=payload.question,
        student_thought=payload.student_thought or "",
        answer=answer,
        model=model,
        provider=provider,
        demo=demo,
    )
    db.add(chat_record)
    db.commit()

    return AiCoachResponse(provider=provider, model=model, demo=demo, answer=answer)


@app.get("/api/ai/coach/history", response_model=list[ChatMessageOut])
def get_chat_history(
    subject: str | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> list[AiChatMessage]:
    query = select(AiChatMessage)
    if subject and subject != "全部":
        query = query.where(AiChatMessage.subject == subject)
    query = query.order_by(AiChatMessage.created_at.asc()).limit(100)
    return list(db.scalars(query))


@app.delete("/api/ai/coach/history", status_code=204, response_class=Response)
def clear_chat_history(
    subject: str | None = None,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_student),
) -> Response:
    if subject and subject != "全部":
        db.query(AiChatMessage).filter(AiChatMessage.subject == subject).delete()
    else:
        db.query(AiChatMessage).delete()
    db.commit()
    return Response(status_code=204)


# ── Weekly Learning Report & AI Diagnosis ──

def weekly_report_response(
    stats: WeeklyStats,
    narrative: tuple[str, str, str, str],
    *,
    report: WeeklyReport | None = None,
    generated_by_ai: bool = False,
) -> WeeklyReportOut:
    highlights, weaknesses, action_plan, parent_advice = narrative
    return WeeklyReportOut(
        id=report.id if report else None,
        week_start=stats.week_start,
        week_end=stats.week_end,
        completion_rate=stats.completion_rate,
        total_planned_tasks=stats.total_planned_tasks,
        total_completed_tasks=stats.total_completed_tasks,
        total_focus_minutes=stats.total_focus_minutes,
        total_pomodoros=stats.total_pomodoros,
        wrong_count=stats.wrong_count,
        mastered_count=stats.mastered_count,
        frequent_cause=stats.frequent_cause,
        weak_subjects=stats.weak_subjects,
        data_sufficient=stats.data_sufficient,
        generated_by_ai=generated_by_ai,
        highlights=highlights,
        weaknesses=weaknesses,
        action_plan=action_plan,
        parent_advice=parent_advice,
        created_at=report.created_at if report else datetime.now(),
    )


@app.get("/api/reports/weekly", response_model=WeeklyReportOut)
def get_weekly_report(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> WeeklyReportOut:
    """Return a side-effect-free report based on current, real data."""
    stats = collect_weekly_stats(db)
    cached = db.scalar(
        select(WeeklyReport)
        .where(WeeklyReport.week_start == stats.week_start)
        .order_by(desc(WeeklyReport.created_at))
    )
    cached_matches = cached is not None and cached.schema_version >= 2 and (
        cached.completion_rate == stats.completion_rate
        and cached.total_focus_minutes == stats.total_focus_minutes
        and cached.total_pomodoros == stats.total_pomodoros
        and cached.wrong_count == stats.wrong_count
        and cached.mastered_count == stats.mastered_count
    )
    if cached_matches:
        return weekly_report_response(
            stats,
            (cached.highlights, cached.weaknesses, cached.action_plan, cached.parent_advice),
            report=cached,
            generated_by_ai=cached.generated_by_ai,
        )
    return weekly_report_response(stats, default_weekly_narrative(stats))


@app.post("/api/reports/weekly", response_model=WeeklyReportOut)
async def generate_weekly_report(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_user),
) -> WeeklyReportOut:
    """Explicitly generate and persist this week's AI narrative."""
    stats = collect_weekly_stats(db)
    narrative = default_weekly_narrative(stats)
    generated_by_ai = False

    if stats.data_sufficient:
        system_prompt = (
            "你是初三资深学情诊断专家。只能依据提供的真实数据生成周报，不得补造数字。"
            "包含4个部分：亮点、薄弱点、行动计划、家长寄语。语气客观、简洁、可执行。"
        )
        user_prompt = (
            f"本周真实学情数据：\n"
            f"- 任务：{stats.total_completed_tasks}/{stats.total_planned_tasks}，完成率 {stats.completion_rate}%\n"
            f"- 专注：{stats.total_focus_minutes} 分钟，{stats.total_pomodoros} 个番茄钟\n"
            f"- 本周新增错题：{stats.wrong_count} 道，已掌握 {stats.mastered_count} 道，高频错因：{stats.frequent_cause}\n"
            f"- 最近一次考试薄弱学科：{'、'.join(stats.weak_subjects) if stats.weak_subjects else '暂无明显弱科'}\n\n"
            "请按【亮点】【薄弱点】【行动计划】【家长寄语】输出，每部分2-3句话，不要添加未提供的数字。"
        )
        try:
            ai_response, _, _ = await request_chat(settings, system_prompt, user_prompt, reasoning=False)
            sections: dict[str, str] = {}
            for part in ai_response.split("【"):
                for label in ("亮点", "薄弱点", "行动计划", "家长寄语"):
                    prefix = f"{label}】"
                    if part.startswith(prefix):
                        sections[label] = part.removeprefix(prefix).strip()
            if all(label in sections for label in ("亮点", "薄弱点", "行动计划", "家长寄语")):
                narrative = (
                    sections["亮点"],
                    sections["薄弱点"],
                    sections["行动计划"],
                    sections["家长寄语"],
                )
                generated_by_ai = True
        except AiUnavailable:
            pass

    report = db.scalar(
        select(WeeklyReport)
        .where(WeeklyReport.week_start == stats.week_start)
        .order_by(desc(WeeklyReport.created_at))
    ) or WeeklyReport(week_start=stats.week_start, week_end=stats.week_end)
    report.week_end = stats.week_end
    report.completion_rate = stats.completion_rate
    report.total_focus_minutes = stats.total_focus_minutes
    report.total_pomodoros = stats.total_pomodoros
    report.wrong_count = stats.wrong_count
    report.mastered_count = stats.mastered_count
    report.schema_version = 2
    report.generated_by_ai = generated_by_ai
    report.highlights, report.weaknesses, report.action_plan, report.parent_advice = narrative
    report.created_at = datetime.now()
    db.add(report)
    db.commit()
    db.refresh(report)
    return weekly_report_response(stats, narrative, report=report, generated_by_ai=generated_by_ai)
