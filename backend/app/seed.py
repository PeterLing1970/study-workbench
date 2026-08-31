from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import WrongQuestion


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
        math_summary = (
            "🏷️ 基础信息\n"
            "学科与考点： 数学 - 二次函数与区间最值综合应用\n"
            "难度评级： ★★★★☆\n"
            "原题重现： 已知二次函数 $f(x) = x^2 - 4x + 3$，求其在闭区间 $x \\in [0, 3]$ 上的最大值与最小值。\n\n"
            "🩺 错因深度诊断\n"
            "我的错解： 直接代入端点 $f(0)=3, f(3)=0$，误认为最大值为 $3$，最小值为 $0$。\n"
            "错误类型： 概念/定理模糊\n"
            "思维卡壳点： 忽略了抛物线对称轴 $x = 2$ 落在自变量区间 $[0, 3]$ 内部，顶点处才是真正的函数极值点。\n\n"
            "✅ 满分标准解析\n"
            "破题思路： 先将解析式化为顶点式确定对称轴与开口方向，再对比区间端点与顶点函数值。\n"
            "规范步骤：\n"
            "1. 配方化为顶点式：$$f(x) = (x - 2)^2 - 1$$\n"
            "2. 抛物线开口向上，对称轴方程为 $x = 2$。\n"
            "3. ∵ 对称轴 $x = 2 \\in [0, 3]$，\n"
            "   ∴ 当 $x = 2$ 时取得最小值：$f(2) = -1$。\n"
            "4. 比较两端点函数值：\n"
            "   $f(0) = (0 - 2)^2 - 1 = 3$\n"
            "   $f(3) = (3 - 2)^2 - 1 = 0$\n"
            "   ∵ $3 > 0$，∴ 最大值为 $3$。\n"
            "正确答案： 最大值为 $3$（当 $x = 0$ 时），最小值为 $-1$（当 $x = 2$ 时）。\n\n"
            "💡 提炼与升华\n"
            "解题\"题眼\"： 看到\"二次函数区间最值\"，第一反应\"三步法：判开口、找对称轴、看是否在区间内\"。\n"
            "避坑法则： 绝不能只算两端点，对称轴在区间内必须优先取顶点值！\n\n"
            "🚀 举一反三（巩固测试）\n"
            "变式训练： 若二次函数 $g(x) = -x^2 + 2x + 1$ 在区间 $x \\in [0, 4]$ 上，求其最大值与最小值。"
        )
        physics_summary = (
            "🏷️ 基础信息\n"
            "学科与考点： 物理 - 欧姆定律与电路动态变化分析\n"
            "难度评级： ★★★☆☆\n"
            "原题重现： 在如图所示电路中，电源电压 $U = 6\\text{V}$ 保持不变，定值电阻 $R_1 = 10\\,\\Omega$，滑动变阻器 $R_2$ 标有“$20\\,\\Omega\\;1\\text{A}$”字样。当滑片 $P$ 移至中点时，求电路中电流表的示数 $I$ 及 $R_1$ 消耗的电功率 $P_1$。\n\n"
            "🩺 错因深度诊断\n"
            "我的错解： 误将滑动变阻器看作并联连接，计算电流时直接用 $I = \\frac{U}{R_2}$。\n"
            "错误类型： 审题与信息提取\n"
            "思维卡壳点： 未沿电流流向正确识别串联路径，混淆了分压分流规律。\n\n"
            "✅ 满分标准解析\n"
            "破题思路： 先判断电路连接方式为串联，滑片在中点时 $R_2 = 10\\,\\Omega$，根据串联等效总电阻计算总电流与电功率。\n"
            "规范步骤：\n"
            "1. 串联总电阻：$$R_{\\text{总}} = R_1 + R_2' = 10\\,\\Omega + 10\\,\\Omega = 20\\,\\Omega$$\n"
            "2. 根据欧姆定律计算干路电流：$$I = \\frac{U}{R_{\\text{总}}} = \\frac{6\\text{V}}{20\\,\\Omega} = 0.3\\text{A}$$\n"
            "3. 计算 $R_1$ 消耗的电功率：$$P_1 = I^2 R_1 = (0.3\\text{A})^2 \\times 10\\,\\Omega = 0.9\\text{W}$$\n"
            "正确答案： 电流表示数为 $0.3\\text{A}$，$R_1$ 消耗电功率为 $0.9\\text{W}$。\n\n"
            "💡 提炼与升华\n"
            "解题\"题眼\"： 动态电路题先“断表还原电路”，电流表等效导线，电压表等效断路。\n"
            "避坑法则： 串联电路电流处处相等，电功率计算优先用 $P = I^2 R$ 更快捷。"
        )
        db.add_all(
            [
                WrongQuestion(
                    subject="数学",
                    title="二次函数在给定区间的最值应用",
                    cause="概念/定理模糊",
                    knowledge_point="二次函数顶点式与区间极值",
                    ai_summary=math_summary,
                    review_status="待复习",
                    review_count=1,
                    next_review_date=today,
                    is_demo=True,
                ),
                WrongQuestion(
                    subject="物理",
                    title="串联电路动态分析与电功率计算",
                    cause="审题与信息提取",
                    knowledge_point="欧姆定律与电功率综合",
                    ai_summary=physics_summary,
                    review_status="待复习",
                    review_count=0,
                    next_review_date=today,
                    is_demo=True,
                ),
            ]
        )

    db.commit()
