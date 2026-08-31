from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import TaskTemplate, WrongQuestion


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
                    is_demo=True,
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
                    is_demo=True,
                ),
            ]
        )

    db.commit()


def seed_default_templates(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(TaskTemplate)) == 0:
        db.add_all(
            [
                TaskTemplate(subject="语文", title="古诗默写", minutes=20, weekdays="0,1,2,3,4,5,6", sort_order=0),
                TaskTemplate(subject="英语", title="单词打卡", minutes=15, weekdays="0,1,2,3,4,5,6", sort_order=1),
                TaskTemplate(subject="数学", title="错题重做", minutes=20, weekdays="0,1,2,3,4,5,6", sort_order=2),
            ]
        )

        db.commit()
