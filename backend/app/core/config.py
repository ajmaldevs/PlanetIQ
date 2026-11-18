import os
from functools import lru_cache
from typing import Any, List, Optional, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application Settings for TerraLens.
    Loads from .env file or environment variables.
    """
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Core Application Settings
    PROJECT_NAME: str = "PlanetIQ"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"
    ALLOW_DEMO_FALLBACK: bool = Field(
        default_factory=lambda: (
            os.getenv("ALLOW_DEMO_FALLBACK", "").strip().lower() in ("true", "1", "yes")
            if os.getenv("ALLOW_DEMO_FALLBACK") is not None and os.getenv("ALLOW_DEMO_FALLBACK").strip() != ""
            else (os.getenv("ENVIRONMENT", "development").strip().lower() != "production")
        )
    )

    @field_validator("ALLOW_DEMO_FALLBACK", mode="before")
    @classmethod
    def set_demo_fallback_default(cls, v: Any) -> bool:
        if v is not None and v != "":
            if isinstance(v, str):
                return v.strip().lower() in ("true", "1", "yes")
            return bool(v)
        env = os.getenv("ENVIRONMENT", "development").strip().lower()
        return env != "production"

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # CORS Allowed Origins
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173",
        "https://planetiq-1.onrender.com",
    ]
    CORS_ORIGIN_REGEX: Optional[str] = (
        r"^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|"
        r"[a-zA-Z0-9\.\-]+\.onrender\.com|"
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
            if not v_stripped:
                return [
                    "http://localhost:3000",
                    "http://localhost:5173",
                    "http://127.0.0.1:3000",
                    "http://127.0.0.1:5173",
                    "http://0.0.0.0:5173",
                    "https://planetiq-1.onrender.com",
                ]
            if v_stripped.startswith("["):
                import json
                try:
                    parsed = json.loads(v_stripped)
                    if isinstance(parsed, list):
                        return [str(i).strip() for i in parsed if str(i).strip()]
                except Exception:
                    pass
            return [i.strip() for i in v_stripped.split(",") if i.strip()]
        return v

    # Database Configuration (PostgreSQL + PostGIS)
    DATABASE_URL: Optional[str] = None
    INTERNAL_DATABASE_URL: Optional[str] = None
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "terralens_user"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "terralens_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT: int = 30
    DATABASE_POOL_RECYCLE: int = 1800  # Recycle idle connections every 30 minutes

    @classmethod
    def _convert_db_url(cls, raw_url: Optional[str], dialect: str) -> Optional[str]:
        if not raw_url or not isinstance(raw_url, str):
            return None
        clean = raw_url.strip()
        if not clean:
            return None
        import urllib.parse
        parsed = urllib.parse.urlsplit(clean)
        # Preserve SQLite URLs for isolated tests
        if parsed.scheme.startswith("sqlite"):
            return clean

        # If already matching target dialect, return as-is
        if parsed.scheme == f"postgresql+{dialect}":
            return clean

        # Convert postgres://, postgresql://, or alternate dialects to postgresql+{dialect}://
        scheme = f"postgresql+{dialect}"
        netloc = parsed.netloc
        path = parsed.path
        query = parsed.query
        return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))

    @property
    def ASYNC_DATABASE_URL(self) -> str:
        import os
        raw_db_url = self.DATABASE_URL or self.INTERNAL_DATABASE_URL or os.getenv("DATABASE_URL") or os.getenv("INTERNAL_DATABASE_URL")
        if raw_db_url:
            converted = self._convert_db_url(raw_db_url, "asyncpg")
            if converted:
                return converted

        from urllib.parse import quote_plus
        auth = ""
        if self.POSTGRES_USER:
            auth = quote_plus(self.POSTGRES_USER)
            if self.POSTGRES_PASSWORD:
                auth += f":{quote_plus(self.POSTGRES_PASSWORD)}"
            auth += "@"
        return f"postgresql+asyncpg://{auth}{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    @property
    def SYNC_DATABASE_URL(self) -> str:
        import os
        raw_db_url = self.DATABASE_URL or self.INTERNAL_DATABASE_URL or os.getenv("DATABASE_URL") or os.getenv("INTERNAL_DATABASE_URL")
        if raw_db_url:
            converted = self._convert_db_url(raw_db_url, "psycopg")
            if converted:
                return converted

        from urllib.parse import quote_plus
        auth = ""
        if self.POSTGRES_USER:
            auth = quote_plus(self.POSTGRES_USER)
            if self.POSTGRES_PASSWORD:
                auth += f":{quote_plus(self.POSTGRES_PASSWORD)}"
            auth += "@"
        return f"postgresql+psycopg://{auth}{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

    # NASA Earthdata & Scientific APIs
    NASA_EARTHDATA_USERNAME: str = ""
    NASA_EARTHDATA_PASSWORD: str = ""
    NASA_EARTHDATA_BEARER_TOKEN: str = ""
    NASA_CMR_ENDPOINT: str = "https://cmr.earthdata.nasa.gov/search"

    @field_validator("NASA_EARTHDATA_USERNAME", mode="before")
    @classmethod
    def resolve_nasa_username(cls, v: Optional[str]) -> str:
        def _clean(val: Optional[str]) -> Optional[str]:
            if val and isinstance(val, str) and not val.strip().startswith("your_"):
                return val.strip()
            return None

        c_v = _clean(v)
        if c_v:
            return c_v
        import os
        for k in ["NASA_EARTHDATA_USERNAME", "NASA_EARTH_USERNAME", "NASA_USERNAME", "EARTHDATA_USERNAME", "EARTH_DATA_USERNAME"]:
            val = _clean(os.getenv(k))
            if val:
                return val
        return ""

    @field_validator("NASA_EARTHDATA_PASSWORD", mode="before")
    @classmethod
    def resolve_nasa_password(cls, v: Optional[str]) -> str:
        def _clean(val: Optional[str]) -> Optional[str]:
            if val and isinstance(val, str) and not val.strip().startswith("your_"):
                return val.strip()
            return None

        c_v = _clean(v)
        if c_v:
            return c_v
        import os
        for k in ["NASA_EARTHDATA_PASSWORD", "NASA_EARTH_PASSWORD", "NASA_PASSWORD", "EARTHDATA_PASSWORD", "EARTH_DATA_PASSWORD"]:
            val = _clean(os.getenv(k))
            if val:
                return val
        return ""

    @field_validator("NASA_EARTHDATA_BEARER_TOKEN", mode="before")
    @classmethod
    def resolve_nasa_token(cls, v: Optional[str]) -> str:
        def _clean(val: Optional[str]) -> Optional[str]:
            if val and isinstance(val, str) and not val.strip().startswith("your_"):
                return val.strip()
            return None

        c_v = _clean(v)
        if c_v:
            return c_v
        import os
        for k in ["NASA_EARTHDATA_BEARER_TOKEN", "NASA_EARTH_BEARER_TOKEN", "EARTHDATA_BEARER_TOKEN", "EARTHDATA_TOKEN", "NASA_BEARER_TOKEN", "EDL_TOKEN"]:
            val = _clean(os.getenv(k))
            if val:
                return val
        return ""

    # AI Integration (Google Gemini API)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.5-flash-lite"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
