import os
from datetime import datetime, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import Settings

settings = Settings(_env_file=None) if os.environ.get("APP_ENV") == "production" else Settings()
engine = create_engine(
    settings.sqlalchemy_url,
    connect_args=settings.connection_args,
    pool_pre_ping=True,
    pool_recycle=300,
)
if settings.sqlalchemy_url.get_backend_name() == "sqlite":

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
