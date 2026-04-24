from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "EDragonboat API"
    debug: bool = False
    secret_key: str = "DEV_ONLY_CHANGE_ME_USE_LONG_RANDOM_STRING"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 días
    database_url: str = "sqlite:///./edragonboat.db"
    # Archivos subidos (logos de equipo, etc.)
    data_dir: str = "data"
    # Orígenes CORS separados por coma. Para * usar solo en dev (credenciales + * puede fallar).
    cors_origins: str = (
        "https://app.edragonboat.com,http://localhost:5173,http://127.0.0.1:5173"
    )
    # Invitaciones por email (opcional). Si smtp_host está vacío, no se envía correo.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True
    app_public_url: str = "https://app.edragonboat.com"
    # Emails (minúsculas) separados por coma: al arrancar la API se marca is_platform_admin=1 en esos usuarios.
    platform_admin_emails: str = ""
    # Cuenta de contacto (Comunidad): se crea un equipo fijo y este usuario como capitán para mensajería.
    platform_contact_email: str = "diegolas@gmail.com"
    platform_inbox_team_name: str = "E-DragonBoat (Administración)"


@lru_cache
def get_settings() -> Settings:
    return Settings()
