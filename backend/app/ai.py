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
) -> list[ProviderConfig]:
    minimax = ProviderConfig(
        name="minimax",
        base_url=settings.minimax_base_url,
        api_key=settings.minimax_api_key,
        model=settings.minimax_model,
    )
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
    deepseek = deepseek_pro if reasoning else deepseek_flash
    if preferred_provider in {"minimax", "deepseek", "deepseek_flash", "deepseek_pro"}:
        if preferred_provider == "minimax":
            ordered = [minimax]
        elif preferred_provider == "deepseek_pro":
            ordered = [deepseek_pro]
        elif preferred_provider == "deepseek_flash":
            ordered = [deepseek_flash]
        else:
            ordered = [deepseek]
    else:
        ordered = [minimax, deepseek] if settings.ai_primary_provider == "minimax" else [deepseek, minimax]
    return [provider for provider in ordered if provider.api_key]


def strip_thinking(text: str) -> str:
    if "</think>" in text:
        return text.split("</think>", 1)[1].strip()
    return text.strip()


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
    candidates = provider_candidates(settings, reasoning=reasoning, preferred_provider=preferred_provider)
    if vision:
        candidates = [provider for provider in candidates if provider.name == "minimax"]
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
            if provider.name == "minimax":
                payload["thinking"] = {"type": "adaptive" if reasoning else "disabled"}
                payload["reasoning_split"] = True
                payload["max_completion_tokens"] = payload.pop("max_tokens")
            elif provider.name == "deepseek":
                is_pro = provider.model == settings.deepseek_reasoning_model
                payload["thinking"] = {"type": "enabled" if is_pro else "disabled"}
                if is_pro:
                    payload["reasoning_effort"] = "high"
                    payload["max_tokens"] = max(max_tokens, 8000)
                else:
                    payload["max_tokens"] = max(max_tokens, 4000)

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
) -> tuple[dict[str, str], str, str]:
    system_prompt = (
        "你是资深初高中学科教师。请识别学生上传的错题图片，准确提取题目内容，"
        "诊断错因、提供踩分点解析并总结解题套路。"
        "数学与理科公式务必使用标准 LaTeX 格式（行内公式用 `$公式$`，独立段落公式用 `$$公式$$`，如 `$y = ax^2 + bx + c$` 或 `$$x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$$`）。"
        "输出严格 JSON，字段为：title（简短标题）、knowledge_point（学科与考点）、"
        "cause（错误类型，从“概念/定理模糊、审题与信息提取、逻辑与方法断层、计算与习惯失误”中精准匹配一个）、"
        "summary（严格按下方【错题本标准模板】生成的完整 Markdown 分析，不要省略任何小节）。\n\n"
        "【错题本标准模板】\n" + WRONG_QUESTION_TEMPLATE
    )
    content: list[dict[str, Any]] = [
        {"type": "text", "text": f"科目：{subject}。请按【错题本标准模板】深度分析这道错题。"},
        image_content(image_path, mime_type),
    ]
    answer, provider, model = await request_chat(
        settings,
        system_prompt,
        content,
        reasoning=subject in {"数学", "物理", "化学"},
        vision=True,
        max_tokens=4000,
    )
    cleaned = answer.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        parsed = {
            "title": f"{subject}拍照错题",
            "knowledge_point": "待人工确认",
            "cause": "待人工确认",
            "summary": answer[:600],
        }
    # 修正双重转义：AI 输出 JSON 时偶发把换行写成 \n（json 解析后变成字面 \n 两字符），
    # 还原为真实换行，保证前端 Markdown 渲染按预期分段。
    normalized = {key: str(parsed.get(key, "")).replace("\\n", "\n") for key in ("title", "knowledge_point", "cause", "summary")}
    return normalized, provider, model


def demo_coach_answer(subject: str) -> str:
    return (
        f"这是{subject}分级提示演示：\n"
        "1. 先把题目中的已知量和目标量分别圈出来。\n"
        "2. 写出对应知识点或公式，但先不要代入数字。\n"
        "3. 检查单位、条件和关键步骤，再继续计算。\n"
        "配置 MiniMax 或 DeepSeek API 后，这里会根据真实题目生成针对性分析。"
    )
