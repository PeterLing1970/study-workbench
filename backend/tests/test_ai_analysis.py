import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.ai import (
    SUBJECT_ANALYSIS_RULES,
    AiUnavailable,
    analyze_wrong_question,
    parse_analysis_response,
)


def complete_analysis() -> dict[str, str]:
    return {
        "title": "一元二次方程实际问题",
        "knowledge_point": "数学 - 一元二次方程建模",
        "cause": "审题与信息提取",
        "summary": (
            "🏷️ 基础信息\n原题完整转录。\n"
            "🩺 错因深度诊断\n指出错误步骤。\n"
            "✅ 满分标准解析\n给出规范步骤。\n"
            "💡 提炼与升华\n总结题眼。\n"
            "🚀 举一反三（巩固测试）\n给出变式题。"
        ),
    }


class AnalysisResponseTests(unittest.TestCase):
    def test_all_supported_subjects_have_distinct_rules(self) -> None:
        expected = {"数学", "物理", "化学", "语文", "英语", "道法", "历史"}
        self.assertEqual(set(SUBJECT_ANALYSIS_RULES), expected)
        self.assertEqual(len(set(SUBJECT_ANALYSIS_RULES.values())), len(expected))

    def test_extracts_json_after_thinking_text(self) -> None:
        payload = json.dumps(complete_analysis(), ensure_ascii=False)
        parsed = parse_analysis_response(f"We need inspect carefully.\n```json\n{payload}\n```\n")
        self.assertEqual(parsed["title"], "一元二次方程实际问题")

    def test_rejects_incomplete_template(self) -> None:
        payload = complete_analysis()
        payload["summary"] = "基础信息\n只有原题，没有后续分析。"
        with self.assertRaisesRegex(ValueError, "缺少完整章节"):
            parse_analysis_response(json.dumps(payload, ensure_ascii=False))


class AnalyzeWrongQuestionTests(unittest.IsolatedAsyncioTestCase):
    async def test_retries_invalid_response_without_saving_thoughts(self) -> None:
        valid_answer = json.dumps(complete_analysis(), ensure_ascii=False)
        request = AsyncMock(
            side_effect=[
                ("We need inspect image carefully and answer strict JSON only.", "deepseek", "deepseek-v4-flash-vision-exp"),
                (valid_answer, "deepseek", "deepseek-v4-flash-vision-exp"),
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / "question.png"
            image.write_bytes(b"not-used-by-mocked-request")
            with patch("app.ai.request_chat", request):
                result, provider, model = await analyze_wrong_question(
                    SimpleNamespace(deepseek_vision_model="deepseek-v4-flash-vision-exp"), image, "image/png", "数学"
                )

        self.assertEqual(result["title"], "一元二次方程实际问题")
        self.assertEqual(provider, "deepseek")
        self.assertEqual(model, "deepseek-v4-flash-vision-exp")
        self.assertEqual(request.await_count, 2)
        for call in request.await_args_list:
            self.assertFalse(call.kwargs["reasoning"])
            self.assertEqual(call.kwargs["max_tokens"], 6000)

    async def test_fails_cleanly_after_two_invalid_responses(self) -> None:
        request = AsyncMock(
            return_value=("We need inspect image carefully.", "deepseek", "deepseek-v4-flash-vision-exp")
        )
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / "question.png"
            image.write_bytes(b"not-used-by-mocked-request")
            with patch("app.ai.request_chat", request):
                with self.assertRaisesRegex(AiUnavailable, "连续两次失败"):
                    await analyze_wrong_question(
                        SimpleNamespace(deepseek_vision_model="deepseek-v4-flash-vision-exp"), image, "image/png", "数学"
                    )

    async def test_retries_after_transient_provider_failure(self) -> None:
        valid_answer = json.dumps(complete_analysis(), ensure_ascii=False)
        request = AsyncMock(
            side_effect=[
                AiUnavailable("deepseek: temporary connection failure"),
                (valid_answer, "deepseek", "deepseek-v4-flash-vision-exp"),
            ]
        )
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / "english-question.png"
            image.write_bytes(b"not-used-by-mocked-request")
            with patch("app.ai.request_chat", request):
                result, provider, model = await analyze_wrong_question(
                    SimpleNamespace(deepseek_vision_model="deepseek-v4-flash-vision-exp"), image, "image/png", "英语"
                )

        self.assertEqual(result["title"], "一元二次方程实际问题")
        self.assertEqual(provider, "deepseek")
        self.assertEqual(model, "deepseek-v4-flash-vision-exp")
        self.assertEqual(request.await_count, 2)
        self.assertIn("【英语专属识别规则】", request.await_args_list[0].args[1])
        self.assertIn("不得把原题翻译成中文", request.await_args_list[0].args[1])

    async def test_forwards_vision_provider_preference(self) -> None:
        valid_answer = json.dumps(complete_analysis(), ensure_ascii=False)
        request = AsyncMock(return_value=(valid_answer, "gemini", "gemini-3.7-flash"))
        with tempfile.TemporaryDirectory() as directory:
            image = Path(directory) / "question.png"
            image.write_bytes(b"not-used-by-mocked-request")
            with patch("app.ai.request_chat", request):
                result, provider, model = await analyze_wrong_question(
                    SimpleNamespace(deepseek_vision_model="deepseek-v4-flash-vision-exp"), image, "image/png", "数学",
                    preferred_provider="gemini",
                )

        self.assertEqual(provider, "gemini")
        self.assertEqual(model, "gemini-3.7-flash")
        call = request.await_args_list[0]
        self.assertTrue(call.kwargs["vision"])
        self.assertEqual(call.kwargs["preferred_provider"], "gemini")


if __name__ == "__main__":
    unittest.main()
