from functools import lru_cache
from typing import List, Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application Settings for TerraLens.
    Loads from .env file or environment variables.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Core Application Settings
    PROJECT_NAME: str = "TerraLens"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS Allowed Origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173",
    ]
    CORS_ORIGIN_REGEX: Optional[str] = (
        r"^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})"
        r"(:\d+)?$"
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            v_stripped = v.strip()
            if not v_stripped.startswith("["):
                return [i.strip() for i in v_stripped.split(",") if i.strip()]
            import json
            try:
                parsed = json.loads(v_stripped)
                if isinstance(parsed, list):
                    return [str(i).strip() for i in parsed if str(i).strip()]
            except Exception:
                pass
        return v

    # Database Configuration (PostgreSQL + PostGIS)
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "terralens_user"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "terralens_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    @property
    def ASYNC_DATABASE_URL(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    @property
    def SYNC_DATABASE_URL(self) -> str:
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # NASA Earthdata & Scientific APIs
    NASA_EARTHDATA_USERNAME: str = ""
    NASA_EARTHDATA_PASSWORD: str = ""
    NASA_EARTHDATA_BEARER_TOKEN: str = ""
    NASA_CMR_ENDPOINT: str = "https://cmr.earthdata.nasa.gov/search"

    # AI Integration (Google Gemini API)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-flash"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
