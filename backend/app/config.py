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
    trusted_origins: str = "https://study.rostai.top,http://localhost:5173,http://127.0.0.1:5173"

    ai_primary_provider: str = "minimax"
    minimax_api_key: str = ""
    minimax_base_url: str = "https://api.minimaxi.com/v1"
    minimax_model: str = "MiniMax-M3"
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-v4-flash"
    deepseek_reasoning_model: str = "deepseek-v4-pro"
    ai_timeout_seconds: int = 90

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
