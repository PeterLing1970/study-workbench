import asyncio
import os
import unittest
from datetime import date, datetime, timedelta

os.environ.setdefault("AUTH_USERNAME", "student")
os.environ.setdefault("AUTH_PASSWORD", "student-password-123")
os.environ.setdefault("AUTH_PARENT_USERNAME", "parent")
os.environ.setdefault("AUTH_PARENT_PASSWORD", "parent-password-1234")
os.environ.setdefault("AUTH_SECRET", "test-secret-that-is-longer-than-thirty-two-characters")

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.database import Base
from app.main import collect_weekly_stats, default_weekly_narrative, generate_weekly_report, get_weekly_report
from app.models import ExamScore, FocusRecord, StudyTask, WeeklyReport, WrongQuestion


class WeeklyReportTruthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite+pysqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.today = date(2026, 8, 31)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_empty_week_keeps_real_zero_values(self) -> None:
        stats = collect_weekly_stats(self.db, self.today)

        self.assertEqual(stats.total_planned_tasks, 0)
        self.assertEqual(stats.total_completed_tasks, 0)
        self.assertEqual(stats.completion_rate, 0)
        self.assertEqual(stats.total_focus_minutes, 0)
        self.assertEqual(stats.total_pomodoros, 0)
        self.assertEqual(stats.wrong_count, 0)
        self.assertEqual(stats.mastered_count, 0)
        self.assertEqual(stats.weak_subjects, [])
        self.assertFalse(stats.data_sufficient)
        self.assertIn("不会使用演示数字", default_weekly_narrative(stats)[0])

    def test_weekly_stats_use_current_week_and_latest_exam(self) -> None:
        week_start = self.today
        self.db.add_all([
            StudyTask(task_date=week_start, subject="数学", title="练习", minutes=20, completed=True),
            StudyTask(task_date=week_start + timedelta(days=1), subject="英语", title="单词", minutes=15, completed=False),
            StudyTask(task_date=week_start, subject="语文", title="已跳过", minutes=30, dismissed=True),
            FocusRecord(subject="数学", title="练习", actual_seconds=1500, pomodoros_completed=1, started_at=datetime(2026, 8, 31, 10)),
            WrongQuestion(subject="数学", title="本周错题", cause="计算步骤", review_status="已掌握", created_at=datetime(2026, 8, 31, 11)),
            WrongQuestion(subject="英语", title="上周错题", cause="词汇", review_status="待复习", created_at=datetime(2026, 8, 30, 11)),
            ExamScore(exam_name="旧考试", exam_date=date(2026, 8, 1), subject="数学", score=60, full_score=120),
            ExamScore(exam_name="最新考试", exam_date=date(2026, 8, 28), subject="数学", score=100, full_score=120),
            ExamScore(exam_name="最新考试", exam_date=date(2026, 8, 28), subject="语文", score=80, full_score=120),
        ])
        self.db.commit()

        stats = collect_weekly_stats(self.db, self.today)

        self.assertEqual(stats.total_planned_tasks, 2)
        self.assertEqual(stats.total_completed_tasks, 1)
        self.assertEqual(stats.completion_rate, 50)
        self.assertEqual(stats.total_focus_minutes, 25)
        self.assertEqual(stats.total_pomodoros, 1)
        self.assertEqual(stats.wrong_count, 1)
        self.assertEqual(stats.mastered_count, 1)
        self.assertEqual(stats.frequent_cause, "计算步骤")
        self.assertEqual(stats.weak_subjects, ["语文"])
        self.assertTrue(stats.data_sufficient)

    def test_get_report_is_side_effect_free(self) -> None:
        response = get_weekly_report(db=self.db, _current_user=None)
        count = self.db.scalar(select(func.count()).select_from(WeeklyReport))

        self.assertEqual(response.total_planned_tasks, 0)
        self.assertFalse(response.generated_by_ai)
        self.assertEqual(count, 0)

    def test_explicit_empty_report_generation_persists_truthful_zeroes(self) -> None:
        response = asyncio.run(generate_weekly_report(db=self.db, _current_user=None))
        stored = self.db.scalar(select(WeeklyReport))

        self.assertIsNotNone(stored)
        self.assertEqual(response.total_focus_minutes, 0)
        self.assertEqual(response.total_planned_tasks, 0)
        self.assertFalse(response.generated_by_ai)
        self.assertIn("数据不足", response.parent_advice)


if __name__ == "__main__":
    unittest.main()
