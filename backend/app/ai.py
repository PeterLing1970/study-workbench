import base64
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from .config import Settings


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    base_url: str
    api_key: str
    model: str


class AiUnavailable(RuntimeError):
    pass


ALLOWED_CAUSES = {
    "概念/定理模糊",
    "审题与信息提取",
    "逻辑与方法断层",
    "计算与习惯失误",
}

REQUIRED_SUMMARY_SECTIONS = (
    "基础信息",
    "错因深度诊断",
    "满分标准解析",
    "提炼与升华",
    "举一反三",
)

SUBJECT_ANALYSIS_RULES = {
    "数学": (
        "逐字识别题干、选项、图形标注、手写过程和填空内容；变量、分式、根式、上下标、方程与不等式必须使用标准LaTeX。"
        "区分印刷题目与学生笔迹，核对符号、正负号、定义域和单位，不得凭空补写图片中不存在的条件。"
    ),
    "物理": (
        "准确识别物理量、单位、方向、图像、电路连接和实验装置；公式使用标准LaTeX，并区分已知量、待求量与单位换算。"
        "诊断时重点检查受力分析、过程状态、适用规律、方向约定、有效数字和实验控制变量。"
    ),
    "化学": (
        "准确识别元素符号、化学式、离子符号、化合价、反应条件、气体或沉淀符号以及实验装置。"
        "化学方程式须检查配平、条件和产物，数字上下标不得混淆；诊断时区分概念、现象、操作、推断和计算错误。"
    ),
    "语文": (
        "忠实保留原文、题干、选项、标点、段落和古诗文断句，不得擅自改写或补全文本。"
        "先判断字音字形、词语成语、病句、古诗文、现代文阅读、名著或写作题型，再依据文本证据分析答题要点与规范表述。"
    ),
    "英语": (
        "逐字保留英文题干、空格、大小写、缩写、标点、选项和学生答案，不得把原题翻译成中文后替代原文。"
        "先判断词汇、固定搭配、语法、完形、阅读、任务型阅读或写作题型；诊断时说明具体语法结构、语境线索和选项排除依据。"
    ),
    "道法": (
        "完整提取材料、设问限定词、主体、情境和分值要求，识别选择题、辨析题、材料分析题或实践探究题。"
        "答案须结合材料并使用教材规范术语，按观点、材料依据和行动要求分点作答，不得编造政策条文或时事事实。"
    ),
    "历史": (
        "准确识别年代、人物、地点、事件、制度、文献材料、地图和时间轴，保持专有名词与朝代名称准确。"
        "先判断题目考查的时序、因果、背景、内容、影响、比较或史料实证，再依据材料与史实分点作答，不得混淆中外时空。"
    ),
}


WRONG_QUESTION_TEMPLATE = """🏷️ 基础信息

- 学科与考点： [例如：数学 - 二次函数与几何综合求最值]
- 难度评级： [★☆☆☆☆ 到 ★★★★★]
- 原题重现： [将图片题目转化为精准文本，补全被遮挡或模糊的条件]

🩺 错因深度诊断

- 我的错解： [识别并转录图片中学生的错误答案]
- 错误类型： [从下方表格中精准匹配核心错因]
- 思维卡壳点： [一针见血指出解答在哪一步偏离了正确方向，例如：“在列受力分析方程时，遗漏了斜面向上的静摩擦力”]

| 核心错因大类 | 典型表现特征 |
| --- | --- |
| 概念/定理模糊 | 公式记忆张冠李戴、未注意定理的适用前提条件（如忽视 $\\Delta \\ge 0$） |
| 审题与信息提取 | 漏看关键字（如“不正确的”、“匀速”）、未挖掘出题目隐含条件 |
| 逻辑与方法断层 | 找不到切入点、无法建立已知条件与求解目标之间的数学/物理模型 |
| 计算与习惯失误 | 移项变号错误、去括号失误、答题不规范导致无谓失分 |

✅ 满分标准解析

- 破题思路： [用通俗的大白话剖析拿到题目后的第一反应。第一步求什么，第二步联立什么]
- 规范步骤： [严格按照中高考阅卷“踩分点”给出过程，分步骤列出，逻辑清晰]
- 正确答案： [高亮最终结果]

💡 提炼与升华

- 解题“题眼”： [建立条件反射，例如：“以后看到题干出现‘相切’，立刻联想到‘圆心到直线距离等于半径’或‘判别式等于0’”]
- 避坑法则： [一句话的定制化警告，防止同类错误再次发生]

🚀 举一反三（巩固测试）

- 变式训练： [由AI自动生成一道考点相同、核心逻辑一致但背景条件微调的新题，仅提供题目，答案折叠或让学生回复后再给出]"""


def provider_candidates(
    settings: Settings,
    reasoning: bool = False,
    preferred_provider: str | None = None,
    vision: bool = False,
) -> list[ProviderConfig]:
    deepseek_flash = ProviderConfig(
        name="deepseek",
        base_url=settings.deepseek_base_url,
        api_key=settings.deepseek_api_key,
        model=settings.deepseek_model,
    )
    deepseek_pro = ProviderConfig(
        name="deepseek",
        base_url=settings.deepseek_base_url,
        api_key=settings.deepseek_api_key,
        model=settings.deepseek_reasoning_model,
    )
    if vision:
        deepseek_vision = ProviderConfig(
            name="deepseek",
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=settings.deepseek_vision_model,
        )
        gemini = ProviderConfig(
            name="gemini",
            base_url=settings.gemini_base_url,
            api_key=settings.gemini_api_key,
            model=settings.gemini_model,
        )
        by_name = {"deepseek": deepseek_vision, "gemini": gemini}
        if preferred_provider in by_name:
            ordered = [by_name[preferred_provider]]
        else:
            primary = getattr(settings, "ai_vision_provider", "deepseek") or "deepseek"
            if primary not in by_name:
                primary = "deepseek"
            ordered = [by_name[primary]] + [by_name[name] for name in by_name if name != primary]
        return [provider for provider in ordered if provider.api_key]

    deepseek = deepseek_pro if reasoning else deepseek_flash
    if preferred_provider in {"deepseek", "deepseek_flash", "deepseek_pro", "gemini"}:
        if preferred_provider == "deepseek_pro":
            ordered = [deepseek_pro]
        elif preferred_provider == "deepseek_flash":
            ordered = [deepseek_flash]
        elif preferred_provider == "gemini":
            gemini = ProviderConfig(
                name="gemini",
                base_url=settings.gemini_base_url,
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
            )
            ordered = [gemini]
        else:
            ordered = [deepseek]
    else:
        if settings.ai_primary_provider == "gemini":
            gemini = ProviderConfig(
                name="gemini",
                base_url=settings.gemini_base_url,
                api_key=settings.gemini_api_key,
                model=settings.gemini_model,
            )
            ordered = [gemini, deepseek]
        else:
            ordered = [deepseek]
    return [provider for provider in ordered if provider.api_key]


def strip_thinking(text: str) -> str:
    if "</think>" in text:
        return text.split("</think>", 1)[1].strip()
    return text.strip()


def parse_analysis_response(answer: str) -> dict[str, str]:
    """Extract and validate the final JSON without ever persisting model thoughts."""
    cleaned = strip_thinking(answer).strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json") :]
    elif cleaned.startswith("```"):
        cleaned = cleaned[len("```") :]
    if cleaned.endswith("```"):
        cleaned = cleaned[: -len("```")]
    cleaned = cleaned.strip()

    parsed: Any = None
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        decoder = json.JSONDecoder()
        for index, character in enumerate(cleaned):
            if character != "{":
                continue
            try:
                candidate, _ = decoder.raw_decode(cleaned[index:])
            except json.JSONDecodeError:
                continue
            if isinstance(candidate, dict):
                parsed = candidate
                break

    if not isinstance(parsed, dict):
        raise ValueError("AI未返回可解析的JSON结果")

    normalized = {
        key: str(parsed.get(key, "")).replace("\\n", "\n").strip()
        for key in ("title", "knowledge_point", "cause", "summary")
    }
    if not normalized["title"] or not normalized["knowledge_point"]:
        raise ValueError("AI识别结果缺少标题或考点")
    if normalized["cause"] not in ALLOWED_CAUSES:
        raise ValueError("AI识别结果中的错因分类无效")
    missing_sections = [
        section for section in REQUIRED_SUMMARY_SECTIONS if section not in normalized["summary"]
    ]
    if missing_sections:
        raise ValueError(f"AI分析缺少完整章节：{'、'.join(missing_sections)}")
    return normalized


async def request_chat(
    settings: Settings,
    system_prompt: str,
    user_content: str | list[dict[str, Any]],
    *,
    reasoning: bool = False,
    vision: bool = False,
    preferred_provider: str | None = None,
    max_tokens: int = 1400,
) -> tuple[str, str, str]:
    candidates = provider_candidates(settings, reasoning=reasoning, preferred_provider=preferred_provider, vision=vision)
    if not candidates:
        raise AiUnavailable("尚未配置可用的AI API密钥")

    errors: list[str] = []
    async with httpx.AsyncClient(timeout=settings.ai_timeout_seconds) as client:
        for provider in candidates:
            payload: dict[str, Any] = {
                "model": provider.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "stream": False,
                "temperature": 0.3,
                "max_tokens": max_tokens,
            }
            if provider.name == "deepseek":
                is_pro = provider.model == settings.deepseek_reasoning_model
                payload["thinking"] = {"type": "enabled" if is_pro else "disabled"}
                if is_pro:
                    payload["reasoning_effort"] = "high"
                    payload["max_tokens"] = max(max_tokens, 8000)
                else:
                    payload["max_tokens"] = max(max_tokens, 4000)
            elif provider.name == "gemini":
                # Google 官方 OpenAI 兼容端点；不支持 thinking 字段，直接给足输出预算。
                payload["max_tokens"] = max(max_tokens, 6000)

            try:
                response = await client.post(
                    f"{provider.base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {provider.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                message = data["choices"][0]["message"]
                content = message.get("content") or ""
                if not content and isinstance(message.get("reasoning_content"), str):
                    # DeepSeek-V3.1 reasoner 偶发把答案写到 reasoning_content，留底。
                    content = message["reasoning_content"]
                if isinstance(content, list):
                    content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
                if not content.strip():
                    raise ValueError("AI 服务返回了空内容（可能被余额、网络或 reasoner 配额限制）")
                return strip_thinking(str(content)), provider.name, provider.model
            except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError, ValueError) as exc:
                errors.append(f"{provider.name}: {exc}")

    raise AiUnavailable("；".join(errors) or "AI服务暂不可用")


def image_content(path: Path, mime_type: str) -> dict[str, Any]:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime_type};base64,{encoded}", "detail": "high"},
    }


async def analyze_wrong_question(
    settings: Settings,
    image_path: Path,
    mime_type: str,
    subject: str,
    preferred_provider: str | None = None,
) -> tuple[dict[str, str], str, str]:
    subject_rule = SUBJECT_ANALYSIS_RULES.get(
        subject,
        "忠实识别图片中的题干、选项、学生作答和批改痕迹，并依据该学科规范分析；不得虚构图片中不存在的信息。",
    )
    system_prompt = (
        "你是资深初高中学科教师。请识别学生上传的错题图片，准确提取题目内容，"
        "诊断错因、提供踩分点解析并总结解题套路。"
        "数学与理科公式务必使用标准 LaTeX 格式（行内公式用 `$公式$`，独立段落公式用 `$$公式$$`，如 `$y = ax^2 + bx + c$` 或 `$$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$`）。"
        f"\n\n【{subject}专属识别规则】\n{subject_rule}\n\n"
        "输出严格 JSON，字段为：title（简短标题）、knowledge_point（学科与考点）、"
        "cause（错误类型，从“概念/定理模糊、审题与信息提取、逻辑与方法断层、计算与习惯失误”中精准匹配一个）、"
        "summary（严格按下方【错题本标准模板】生成的完整 Markdown 分析，不要省略任何小节）。\n\n"
        "【错题本标准模板】\n" + WRONG_QUESTION_TEMPLATE
    )
    content: list[dict[str, Any]] = [
        {"type": "text", "text": f"科目：{subject}。请按【错题本标准模板】深度分析这道错题。"},
        image_content(image_path, mime_type),
    ]
    validation_errors: list[str] = []
    provider = preferred_provider or "deepseek"
    model = settings.deepseek_vision_model
    for attempt in range(2):
        retry_instruction = ""
        if attempt:
            retry_instruction = (
                "上一次结果格式或章节不完整。请重新识别图片；严禁输出思考过程、英文草稿、解释文字或Markdown代码围栏，"
                "只输出一个完整JSON对象，并确保summary包含模板全部章节。"
            )
        try:
            answer, provider, model = await request_chat(
                settings,
                system_prompt + retry_instruction,
                content,
                reasoning=False,
                vision=True,
                preferred_provider=preferred_provider,
                max_tokens=6000,
            )
        except AiUnavailable as exc:
            validation_errors.append(str(exc))
            continue
        try:
            return parse_analysis_response(answer), provider, model
        except ValueError as exc:
            validation_errors.append(str(exc))

    raise AiUnavailable("AI识别连续两次失败：" + "；".join(validation_errors))


def demo_coach_answer(subject: str) -> str:
    return (
        f"这是{subject}分级提示演示：\n"
        "1. 先把题目中的已知量和目标量分别圈出来。\n"
        "2. 写出对应知识点或公式，但先不要代入数字。\n"
        "3. 检查单位、条件和关键步骤，再继续计算。\n"
        "配置 DeepSeek 或 Gemini API 后，这里会根据真实题目生成针对性分析。"
    )
