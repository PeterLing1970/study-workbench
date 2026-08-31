from collections import defaultdict, deque
from datetime import datetime
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import Engine, inspect, select, text
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .database import get_db
from .models import User
from .schemas import LoginRequest, UserOut
from .security import InvalidSession, create_session_token, hash_password, read_session_token, verify_password


class LoginAttemptGuard:
    def __init__(self, *, limit: int = 5, window_seconds: int = 600) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, client_key: str) -> None:
        current = monotonic()
        with self._lock:
            attempts = self._attempts[client_key]
            while attempts and current - attempts[0] > self.window_seconds:
                attempts.popleft()
            if len(attempts) >= self.limit:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="登录尝试过多，请稍后再试",
                )
            attempts.append(current)

    def reset(self, client_key: str) -> None:
        with self._lock:
            self._attempts.pop(client_key, None)


login_guard = LoginAttemptGuard()


def normalize_username(username: str) -> str:
    return username.strip().lower()


def ensure_user_role_schema(engine: Engine) -> None:
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        if "role" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'student'"))
        if "display_name" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR(40) NOT NULL DEFAULT ''"))
        if "grade" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN grade VARCHAR(20) NOT NULL DEFAULT '初三'"))


def ensure_feature_schema(engine: Engine) -> None:
    """为 5-8 阶段新增字段/表做幂等迁移（create_all 只建新表，不给已有表加列）。"""
    with engine.begin() as connection:
        inspector = inspect(connection)
        task_columns = {column["name"] for column in inspector.get_columns("study_tasks")}
        if "template_id" not in task_columns:
            connection.execute(text("ALTER TABLE study_tasks ADD COLUMN template_id INTEGER"))
        if "dismissed" not in task_columns:
            connection.execute(text("ALTER TABLE study_tasks ADD COLUMN dismissed BOOLEAN NOT NULL DEFAULT FALSE"))

        # v0.4.2 starts with a genuinely empty plan. Remove only the exact
        # built-in templates from older builds; user-created templates remain.
        if inspector.has_table("task_templates"):
            legacy_templates = """
                (subject = '语文' AND title = '古诗默写' AND minutes = 20)
                OR (subject = '英语' AND title = '单词打卡' AND minutes = 15)
                OR (subject = '数学' AND title = '错题重做' AND minutes = 20)
                OR (title = '学校作业' AND subject IN ('语文','数学','英语','物理','化学','道法','历史'))
            """
            connection.execute(text(f"""
                UPDATE study_tasks SET dismissed = TRUE
                WHERE completed = FALSE AND template_id IN (
                    SELECT id FROM task_templates WHERE {legacy_templates}
                )
            """))
            connection.execute(text(f"DELETE FROM task_templates WHERE {legacy_templates}"))

        wq_columns = {column["name"] for column in inspector.get_columns("wrong_questions")}
        if "review_count" not in wq_columns:
            connection.execute(text("ALTER TABLE wrong_questions ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0"))
        if "next_review_date" not in wq_columns:
            connection.execute(text("ALTER TABLE wrong_questions ADD COLUMN next_review_date DATE"))
        if "is_demo" not in wq_columns:
            connection.execute(text("ALTER TABLE wrong_questions ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE"))
            connection.execute(text("UPDATE wrong_questions SET is_demo = TRUE WHERE title IN ('二次函数最值题', '串并联电路判断')"))

        score_columns = {column["name"] for column in inspector.get_columns("exam_scores")}
        if "is_demo" not in score_columns:
            connection.execute(text("ALTER TABLE exam_scores ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE"))
        if "class_rank" not in score_columns:
            connection.execute(text("ALTER TABLE exam_scores ADD COLUMN class_rank INTEGER"))
        if "grade_rank" not in score_columns:
            connection.execute(text("ALTER TABLE exam_scores ADD COLUMN grade_rank INTEGER"))
        connection.execute(
            text("DELETE FROM exam_scores WHERE exam_name IN (:july_exam, :august_exam)"),
            {"july_exam": "七月期末摸底", "august_exam": "八月阶段测验"},
        )

        report_columns = {column["name"] for column in inspector.get_columns("weekly_reports")}
        if "schema_version" not in report_columns:
            connection.execute(text("ALTER TABLE weekly_reports ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1"))
        if "generated_by_ai" not in report_columns:
            connection.execute(text("ALTER TABLE weekly_reports ADD COLUMN generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE"))


def ensure_auth_users(db: Session, settings: Settings) -> list[User]:
    account_specs = (
        (normalize_username(settings.auth_username), settings.auth_password, "student"),
        (normalize_username(settings.auth_parent_username), settings.auth_parent_password, "parent"),
    )
    if account_specs[0][0] == account_specs[1][0]:
        raise RuntimeError("学生账号和家长账号不能相同")

    users: list[User] = []
    for username, password, role in account_specs:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            user = User(username=username, password_hash=hash_password(password), role=role)
            db.add(user)
        elif not verify_password(password, user.password_hash):
            user.password_hash = hash_password(password)
            user.password_changed_at = datetime.utcnow()
        user.role = role
        user.is_active = True
        users.append(user)
    db.commit()
    for user in users:
        db.refresh(user)
    return users


def set_session_cookie(response: Response, user: User, settings: Settings) -> None:
    max_age_seconds = settings.auth_session_hours * 60 * 60
    token = create_session_token(
        user_id=user.id,
        username=user.username,
        secret=settings.auth_secret,
        max_age_seconds=max_age_seconds,
    )
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age_seconds,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def require_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    token = request.cookies.get(settings.auth_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    try:
        claims = read_session_token(token, settings.auth_secret)
    except InvalidSession as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期，请重新登录") from exc
    user = db.get(User, claims.user_id)
    if user is None or not user.is_active or user.username != claims.username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已失效，请重新登录")
    return user


def require_student(current_user: User = Depends(require_user)) -> User:
    if current_user.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="家长账号仅可查看学习数据")
    return current_user


def login(
    request: Request,
    response: Response,
    payload: LoginRequest,
    db: Session,
    settings: Settings,
) -> UserOut:
    client_key = request.client.host if request.client else "unknown"
    login_guard.check(client_key)
    username = normalize_username(payload.username)
    user = db.scalar(select(User).where(User.username == username))
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    login_guard.reset(client_key)
    set_session_cookie(response, user, settings)
    return UserOut.model_validate(user)
