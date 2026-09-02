from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "初三AI学习工作台"
    environment: str = "production"
    database_url: str = "postgresql+psycopg://study:study@db:5432/study"
    upload_dir: str = "/data/uploads"
    max_upload_mb: int = 10
    seed_demo_data: bool = False

    auth_username: str = Field(min_length=3, max_length=40)
    auth_password: str = Field(min_length=12, max_length=128)
    auth_parent_username: str = Field(min_length=3, max_length=40)
    auth_parent_password: str = Field(min_length=12, max_length=128)
    auth_secret: str = Field(min_length=32)
    auth_cookie_name: str = "study_session"
    auth_cookie_secure: bool = False
    auth_session_hours: int = Field(default=168, ge=1, le=720)
    trusted_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    ai_primary_provider: str = "deepseek"
    # 错题拍照识别使用的视觉模型：deepseek（deepseek-v4-flash-vision-exp）| gemini
    ai_vision_provider: str = "deepseek"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_reasoning_model: str = "deepseek-v4-pro"
    deepseek_vision_model: str = "deepseek-v4-flash-vision-exp"
    gemini_api_key: str = ""
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_model: str = "gemini-3.7-flash"
    ai_timeout_seconds: int = 90

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
