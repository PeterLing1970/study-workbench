import os
import unittest
from datetime import date, timedelta
from types import SimpleNamespace

os.environ.setdefault("AUTH_USERNAME", "student")
os.environ.setdefault("AUTH_PASSWORD", "student-password-123")
os.environ.setdefault("AUTH_PARENT_USERNAME", "parent")
os.environ.setdefault("AUTH_PARENT_PASSWORD", "parent-password-1234")
os.environ.setdefault("AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session

from app.database import Base
from app.auth import ensure_feature_schema
from app.ai import provider_candidates
from app.main import add_score, compute_next_review, generate_tasks_from_templates, has_valid_image_signature, update_wrong_question
from app.models import StudyTask, TaskTemplate, WrongQuestion
from app.schemas import ScoreCreate, WrongQuestionUpdate


class TaskTemplateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_template_generation_is_idempotent_and_respects_weekday(self) -> None:
        monday = date(2026, 8, 31)
        self.db.add_all([
            TaskTemplate(subject="数学", title="每日练习", minutes=20, weekdays="0,2", active=True),
            TaskTemplate(subject="英语", title="周二任务", minutes=15, weekdays="1", active=True),
            TaskTemplate(subject="语文", title="停用任务", minutes=10, weekdays="0", active=False),
        ])
        self.db.commit()

        generate_tasks_from_templates(self.db, monday)
        generate_tasks_from_templates(self.db, monday)
        tasks = list(self.db.scalars(select(StudyTask)))

        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0].title, "每日练习")

    def test_dismissed_template_task_is_not_generated_again(self) -> None:
        monday = date(2026, 8, 31)
        self.db.add(TaskTemplate(subject="数学", title="每日练习", minutes=20, weekdays="0", active=True))
        self.db.commit()
        generate_tasks_from_templates(self.db, monday)
        task = self.db.scalar(select(StudyTask))
        self.assertIsNotNone(task)
        task.dismissed = True
        self.db.commit()

        generate_tasks_from_templates(self.db, monday)

        self.assertEqual(self.db.scalar(select(func.count()).select_from(StudyTask)), 1)

    def test_upgrade_removes_only_built_in_templates(self) -> None:
        built_in = TaskTemplate(subject="语文", title="古诗默写", minutes=20, weekdays="0", active=True)
        custom = TaskTemplate(subject="语文", title="作文素材整理", minutes=25, weekdays="0", active=True)
        self.db.add_all([built_in, custom])
        self.db.commit()
        self.db.add(StudyTask(
            task_date=date(2026, 8, 31),
            subject="语文",
            title="古诗默写",
            minutes=20,
            template_id=built_in.id,
        ))
        self.db.commit()

        ensure_feature_schema(self.engine)
        self.db.expire_all()

        templates = list(self.db.scalars(select(TaskTemplate).order_by(TaskTemplate.id)))
        task = self.db.scalar(select(StudyTask))
        self.assertEqual([item.title for item in templates], ["作文素材整理"])
        self.assertTrue(task.dismissed)


class FeatureMigrationTests(unittest.TestCase):
    def test_existing_tables_receive_v041_columns(self) -> None:
        engine = create_engine("sqlite+pysqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE study_tasks (id INTEGER PRIMARY KEY)"))
            connection.execute(text("CREATE TABLE wrong_questions (id INTEGER PRIMARY KEY, title VARCHAR(160))"))
            connection.execute(text("CREATE TABLE exam_scores (id INTEGER PRIMARY KEY, exam_name VARCHAR(120))"))
            connection.execute(
                text("INSERT INTO exam_scores (exam_name) VALUES (:first), (:second), (:third)"),
                {"first": "七月期末摸底", "second": "八月阶段测验", "third": "九月月考"},
            )
            connection.execute(text("CREATE TABLE weekly_reports (id INTEGER PRIMARY KEY)"))

        ensure_feature_schema(engine)
        inspector = inspect(engine)

        self.assertTrue({"template_id", "dismissed"}.issubset(
            {column["name"] for column in inspector.get_columns("study_tasks")}
        ))
        self.assertTrue({"review_count", "next_review_date"}.issubset(
            {column["name"] for column in inspector.get_columns("wrong_questions")}
        ))
        self.assertTrue({"is_demo", "class_rank", "grade_rank"}.issubset(
            {column["name"] for column in inspector.get_columns("exam_scores")}
        ))
        with engine.connect() as connection:
            remaining_exams = list(connection.execute(text("SELECT exam_name FROM exam_scores ORDER BY exam_name")).scalars())
        self.assertEqual(remaining_exams, ["九月月考"])
        self.assertTrue({"schema_version", "generated_by_ai"}.issubset(
            {column["name"] for column in inspector.get_columns("weekly_reports")}
        ))
        engine.dispose()


class UploadValidationTests(unittest.TestCase):
    def test_image_signature_must_match_declared_type(self) -> None:
        self.assertTrue(has_valid_image_signature(b"\x89PNG\r\n\x1a\nrest", "image/png"))
        self.assertFalse(has_valid_image_signature(b"not really an image", "image/png"))
        self.assertTrue(has_valid_image_signature(b"RIFFxxxxWEBPrest", "image/webp"))


class AiProviderSelectionTests(unittest.TestCase):
    def test_explicit_provider_disables_automatic_fallback(self) -> None:
        settings = SimpleNamespace(
            minimax_base_url="https://example.invalid/minimax",
            minimax_api_key="minimax-key",
            minimax_model="MiniMax-M3",
            deepseek_base_url="https://example.invalid/deepseek",
            deepseek_api_key="deepseek-key",
            deepseek_model="deepseek-chat",
            deepseek_reasoning_model="deepseek-reasoner",
            ai_primary_provider="minimax",
        )

        candidates = provider_candidates(settings, preferred_provider="deepseek")

        self.assertEqual([candidate.name for candidate in candidates], ["deepseek"])

    def test_deepseek_v4_models_can_be_selected_explicitly(self) -> None:
        settings = SimpleNamespace(
            minimax_base_url="https://example.invalid/minimax",
            minimax_api_key="minimax-key",
            minimax_model="MiniMax-M3",
            deepseek_base_url="https://example.invalid/deepseek",
            deepseek_api_key="deepseek-key",
            deepseek_model="deepseek-v4-flash",
            deepseek_reasoning_model="deepseek-v4-pro",
            ai_primary_provider="minimax",
        )

        flash = provider_candidates(settings, preferred_provider="deepseek_flash")
        pro = provider_candidates(settings, preferred_provider="deepseek_pro")

        self.assertEqual([candidate.model for candidate in flash], ["deepseek-v4-flash"])
        self.assertEqual([candidate.model for candidate in pro], ["deepseek-v4-pro"])


class ScoreFullScoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_academic_subject_accepts_100_or_120_full_score(self) -> None:
        for full_score in (100, 120):
            saved = add_score(
                ScoreCreate(exam_name=f"{full_score}分制测试", exam_date=date(2026, 8, 31), subject="数学", score=88, full_score=full_score),
                db=self.db,
                _current_user=None,
            )
            self.assertEqual(saved.full_score, full_score)

    def test_physical_education_keeps_40_full_score(self) -> None:
        saved = add_score(
            ScoreCreate(exam_name="体育测试", exam_date=date(2026, 8, 31), subject="体育", score=36, full_score=40),
            db=self.db,
            _current_user=None,
        )
        self.assertEqual(saved.full_score, 40)


class SpacedRepetitionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_review_intervals_start_at_one_day_and_cap_at_thirty(self) -> None:
        today = date.today()
        self.assertEqual(compute_next_review(1), today + timedelta(days=1))
        self.assertEqual(compute_next_review(2), today + timedelta(days=3))
        self.assertEqual(compute_next_review(99), today + timedelta(days=30))

    def test_marking_reviewed_increments_count_and_schedules_next_day(self) -> None:
        item = WrongQuestion(subject="数学", title="测试错题", review_count=0, review_status="待复习")
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        updated = update_wrong_question(
            item.id,
            WrongQuestionUpdate(review_status="已复习"),
            db=self.db,
            _current_user=None,
        )

        self.assertEqual(updated.review_count, 1)
        self.assertEqual(updated.next_review_date, date.today() + timedelta(days=1))
        self.assertFalse(updated.has_image)
        self.assertIsNone(updated.image_url)
        count = self.db.scalar(select(func.count()).select_from(WrongQuestion))
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
