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


def provider_candidates(settings: Settings, reasoning: bool = False) -> list[ProviderConfig]:
    minimax = ProviderConfig(
        name="minimax",
        base_url=settings.minimax_base_url,
        api_key=settings.minimax_api_key,
        model=settings.minimax_model,
    )
    deepseek = ProviderConfig(
        name="deepseek",
        base_url=settings.deepseek_base_url,
        api_key=settings.deepseek_api_key,
        model=settings.deepseek_reasoning_model if reasoning else settings.deepseek_model,
    )
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
) -> tuple[str, str, str]:
    candidates = provider_candidates(settings, reasoning=reasoning)
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
                "max_tokens": 1400,
            }
            if provider.name == "minimax":
                payload["thinking"] = {"type": "adaptive" if reasoning else "disabled"}
                payload["reasoning_split"] = True
                payload["max_completion_tokens"] = payload.pop("max_tokens")
            elif provider.name == "deepseek":
                payload["thinking"] = {"type": "enabled" if reasoning else "disabled"}

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
                content = data["choices"][0]["message"]["content"]
                if isinstance(content, list):
                    content = "\n".join(part.get("text", "") for part in content if isinstance(part, dict))
                return strip_thinking(str(content)), provider.name, provider.model
            except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
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
        "你是初三学生的学习辅导助手。只分析题目和学生可见信息，不制造成绩。"
        "输出严格JSON，字段为 title、knowledge_point、cause、summary。"
        "summary按‘题意—关键方法—下一步复习’组织，避免直接给最终答案，控制在180字内。"
    )
    content: list[dict[str, Any]] = [
        {"type": "text", "text": f"科目：{subject}。请整理这道错题。"},
        image_content(image_path, mime_type),
    ]
    answer, provider, model = await request_chat(
        settings,
        system_prompt,
        content,
        reasoning=subject in {"数学", "物理", "化学"},
        vision=True,
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
    return {key: str(parsed.get(key, "")) for key in ("title", "knowledge_point", "cause", "summary")}, provider, model


def demo_coach_answer(subject: str) -> str:
    return (
        f"这是{subject}分级提示演示：\n"
        "1. 先把题目中的已知量和目标量分别圈出来。\n"
        "2. 写出对应知识点或公式，但先不要代入数字。\n"
        "3. 检查单位、条件和关键步骤，再继续计算。\n"
        "配置 MiniMax 或 DeepSeek API 后，这里会根据真实题目生成针对性分析。"
    )

