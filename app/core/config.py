from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "EDragonboat API"
    debug: bool = False
    secret_key: str = "DEV_ONLY_CHANGE_ME_USE_LONG_RANDOM_STRING"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 días
    database_url: str = "sqlite:///./edragonboat.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()
