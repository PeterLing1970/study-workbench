from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import ExamScore, StudyTask, TaskTemplate, WrongQuestion


SUBJECT_FULL_SCORES = {
    "语文": 120,
    "数学": 120,
    "英语": 120,
    "道法": 100,
    "物理": 100,
    "化学": 100,
    "历史": 100,
    "体育": 40,
}


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(StudyTask)) == 0:
        today = date.today()
        db.add_all(
            [
                StudyTask(task_date=today, subject="语文", title="古诗默写", minutes=20, sort_order=0),
                StudyTask(task_date=today, subject="数学", title="二次函数错题复习", minutes=25, sort_order=1),
                StudyTask(task_date=today, subject="英语", title="阅读理解", minutes=20, completed=True, sort_order=2),
                StudyTask(task_date=today, subject="物理", title="电路复习", minutes=15, sort_order=3),
                StudyTask(task_date=today, subject="化学", title="化学方程式默写", minutes=15, sort_order=4),
                StudyTask(task_date=today, subject="道法", title="时事热点整理", minutes=15, sort_order=5),
                StudyTask(task_date=today, subject="历史", title="近代史时间轴", minutes=15, sort_order=6),
            ]
        )

    if db.scalar(select(func.count()).select_from(WrongQuestion)) == 0:
        today = date.today()
        db.add_all(
            [
                WrongQuestion(
                    subject="数学",
                    title="二次函数最值题",
                    cause="计算步骤",
                    knowledge_point="二次函数顶点式",
                    ai_summary="先确认开口方向，再结合自变量范围判断端点与顶点。",
                    review_status="待复习",
                    review_count=1,
                    next_review_date=today,
                ),
                WrongQuestion(
                    subject="物理",
                    title="串并联电路判断",
                    cause="条件遗漏",
                    knowledge_point="电流路径与电表连接",
                    ai_summary="先画出电流路径，再判断电流表和电压表的测量对象。",
                    review_status="待复习",
                    review_count=0,
                    next_review_date=today,
                ),
            ]
        )

    if db.scalar(select(func.count()).select_from(ExamScore)) == 0:
        exam1_date = date.today() - timedelta(days=28)
        exam2_date = date.today() - timedelta(days=7)
        demo_scores_1 = {
            "语文": 88, "数学": 96, "英语": 102,
            "道法": 76, "物理": 80, "化学": 78, "历史": 72, "体育": 34,
        }
        demo_scores_2 = {
            "语文": 95, "数学": 108, "英语": 112,
            "道法": 85, "物理": 89, "化学": 86, "历史": 82, "体育": 38,
        }
        scores_to_add = [
            ExamScore(
                exam_name="七月期末摸底",
                exam_date=exam1_date,
                subject=subject,
                score=score,
                full_score=SUBJECT_FULL_SCORES[subject],
            )
            for subject, score in demo_scores_1.items()
        ] + [
            ExamScore(
                exam_name="八月阶段测验",
                exam_date=exam2_date,
                subject=subject,
                score=score,
                full_score=SUBJECT_FULL_SCORES[subject],
            )
            for subject, score in demo_scores_2.items()
        ]
        db.add_all(scores_to_add)

    if db.scalar(select(func.count()).select_from(TaskTemplate)) == 0:
        db.add_all(
            [
                TaskTemplate(subject="语文", title="古诗默写", minutes=20, weekdays="0,1,2,3,4,5,6", sort_order=0),
                TaskTemplate(subject="英语", title="单词打卡", minutes=15, weekdays="0,1,2,3,4,5,6", sort_order=1),
                TaskTemplate(subject="数学", title="错题重做", minutes=20, weekdays="0,1,2,3,4,5,6", sort_order=2),
            ]
        )

    db.commit()

