"""Environment configuration with safe validation for public deployments."""

from decimal import Decimal
from ipaddress import ip_address
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL, make_url


def is_local_host(host: str | None) -> bool:
    host = host.rstrip(".").lower() if host else host
    if not host or host.lower() in {"localhost", "0.0.0.0"} or host.lower().endswith(".localhost"):
        return True
    try:
        return ip_address(host).is_loopback or ip_address(host).is_unspecified
    except ValueError:
        return False


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    database_url: SecretStr = SecretStr("sqlite:///./velora.db")
    database_sslmode: Literal["prefer", "require", "verify-ca", "verify-full"] | None = None
    frontend_origin: str = "http://127.0.0.1:5173"
    frontend_origins: str = ""
    commission_percent: Decimal = Field(default=Decimal("5"), ge=0, le=100)
    session_hours: int = Field(default=24, ge=1, le=168)
    admin_email: str = ""
    admin_password: SecretStr = SecretStr("")
    uploads_enabled: bool | None = None
    upload_dir: str = ""
    model_config = SettingsConfigDict(
        env_file=(str(Path(__file__).parents[2] / ".env"), ".env"),
        extra="ignore",
        hide_input_in_errors=True,
    )

    @property
    def sqlalchemy_url(self) -> URL:
        try:
            url = make_url(self.database_url.get_secret_value())
        except Exception:
            raise ValueError("DATABASE_URL must be a valid PostgreSQL or SQLite URL") from None
        if url.drivername in {"postgres", "postgresql"}:
            url = url.set(drivername="postgresql+psycopg")
        if url.drivername not in {"postgresql+psycopg", "sqlite"}:
            raise ValueError("Use PostgreSQL with psycopg, or SQLite for local development")
        return url

    @property
    def cors_origins(self) -> list[str]:
        values = (self.frontend_origins or self.frontend_origin).split(",")
        origins = list(
            dict.fromkeys(value.strip().rstrip("/") for value in values if value.strip())
        )
        for origin in origins:
            try:
                parsed = urlsplit(origin)
                valid = (
                    parsed.scheme in {"http", "https"}
                    and parsed.hostname
                    and "*" not in parsed.netloc
                    and not any(
                        [
                            parsed.username,
                            parsed.password,
                            parsed.query,
                            parsed.fragment,
                            parsed.path,
                        ]
                    )
                )
                # Accessing port also validates malformed port values.
                parsed.port
            except ValueError:
                valid = False
            if not valid:
                raise ValueError(
                    "Frontend origins must be exact HTTP(S) origins, without paths or wildcards"
                )
            if self.app_env == "production" and (
                parsed.scheme != "https" or is_local_host(parsed.hostname)
            ):
                raise ValueError("Production requires exact public HTTPS frontend origins")
        if not origins:
            raise ValueError("At least one frontend origin is required")
        return origins

    @property
    def image_uploads_enabled(self) -> bool:
        return (
            self.uploads_enabled
            if self.uploads_enabled is not None
            else self.app_env != "production"
        )

    @property
    def uploads_path(self) -> Path:
        return (
            Path(self.upload_dir).expanduser().resolve()
            if self.upload_dir
            else Path(__file__).parents[1] / "uploads"
        )

    @property
    def connection_args(self) -> dict:
        url = self.sqlalchemy_url
        if url.get_backend_name() == "sqlite":
            return {"check_same_thread": False}
        args = {"connect_timeout": 5}
        sslmode = self.database_sslmode or url.query.get("sslmode")
        # A generic hosting default must not weaken provider-supplied certificate checks.
        strength = {"prefer": 0, "require": 1, "verify-ca": 2, "verify-full": 3}
        provider_mode = url.query.get("sslmode")
        if provider_mode in strength and strength[provider_mode] > strength.get(sslmode, -1):
            sslmode = provider_mode
        if sslmode is not None:
            args["sslmode"] = sslmode
        elif self.app_env == "production":
            args["sslmode"] = "require"
        return args

    @model_validator(mode="after")
    def deployment_requirements(self):
        url = self.sqlalchemy_url
        self.cors_origins
        if self.app_env == "production":
            if url.get_backend_name() != "postgresql" or is_local_host(url.host):
                raise ValueError(
                    "Production requires a hosted PostgreSQL DATABASE_URL; local databases are not allowed"
                )
            mode = self.connection_args.get("sslmode")
            if mode not in {"require", "verify-ca", "verify-full"}:
                raise ValueError("Production PostgreSQL connections require TLS")
            if self.image_uploads_enabled and not self.upload_dir:
                raise ValueError(
                    "Enable production uploads only with an explicitly configured persistent UPLOAD_DIR"
                )
        return self
