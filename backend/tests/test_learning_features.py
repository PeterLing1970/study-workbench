import os
import unittest
from datetime import date, timedelta

os.environ.setdefault("AUTH_USERNAME", "student")
os.environ.setdefault("AUTH_PASSWORD", "student-password-123")
os.environ.setdefault("AUTH_PARENT_USERNAME", "parent")
os.environ.setdefault("AUTH_PARENT_PASSWORD", "parent-password-1234")
os.environ.setdefault("AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session

from app.database import Base
from app.auth import ensure_feature_schema
from app.main import compute_next_review, generate_tasks_from_templates, has_valid_image_signature, update_wrong_question
from app.models import StudyTask, TaskTemplate, WrongQuestion
from app.schemas import WrongQuestionUpdate


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

        self.assertIn("template_id", {column["name"] for column in inspector.get_columns("study_tasks")})
        self.assertTrue({"review_count", "next_review_date"}.issubset(
            {column["name"] for column in inspector.get_columns("wrong_questions")}
        ))
        self.assertIn("is_demo", {column["name"] for column in inspector.get_columns("exam_scores")})
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
        count = self.db.scalar(select(func.count()).select_from(WrongQuestion))
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
