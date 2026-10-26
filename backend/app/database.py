from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Settings(BaseSettings):
    database_url: str = "sqlite:///./velora.db"
    frontend_origin: str = "http://localhost:5173"
    commission_percent: Decimal = Field(default=Decimal("5"), ge=0, le=100)
    session_hours: int = Field(default=24, ge=1, le=168)
    admin_email: str = ""
    admin_password: str = ""
    model_config = SettingsConfigDict(
        env_file=(str(Path(__file__).parents[2] / ".env"), ".env"), extra="ignore"
    )


settings = Settings()
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_settings(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")


SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_db():
    with SessionLocal() as db:
        yield db
