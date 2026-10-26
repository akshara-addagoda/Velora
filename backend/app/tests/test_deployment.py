import json
import os
import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.exc import ProgrammingError

from app.config import Settings
from app.database import get_db, settings
from app.main import app


def production(**overrides):
    values = {
        "app_env": "production",
        "database_url": "postgresql://demo:synthetic-password@db.example.com/demo",
        "frontend_origins": "https://velora.example.com",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize("prefix", ["postgres://", "postgresql://", "postgresql+psycopg://"])
def test_hosted_provider_urls_use_the_installed_driver(prefix):
    config = production(database_url=prefix + "demo:synthetic%40password@db.example.com/demo")
    assert config.sqlalchemy_url.drivername == "postgresql+psycopg"
    assert config.sqlalchemy_url.password == "synthetic@password"
    assert config.connection_args["sslmode"] == "require"
    # Engine creation selects psycopg without connecting to any database.
    engine = create_engine(config.sqlalchemy_url, connect_args=config.connection_args)
    assert engine.dialect.driver == "psycopg"
    engine.dispose()


@pytest.mark.parametrize(
    "url",
    [
        "sqlite:///unsafe.db",
        "postgresql://demo:x@localhost/demo",
        "postgresql://demo:x@127.0.0.2/demo",
    ],
)
def test_production_rejects_missing_or_local_database_configuration(url):
    with pytest.raises(ValidationError, match="hosted PostgreSQL"):
        production(database_url=url)


@pytest.mark.parametrize(
    "origins",
    [
        "*",
        "https://*.vercel.app",
        "http://velora.example.com",
        "https://localhost",
        "https://velora.example.com/path",
    ],
)
def test_production_requires_an_exact_public_https_cors_origin(origins):
    with pytest.raises(ValidationError):
        production(frontend_origins=origins)


def test_multiple_explicit_cors_origins_and_decimal_money():
    config = production(
        frontend_origins="https://velora.example.com/, https://mentor.example.com,https://velora.example.com"
    )
    assert config.cors_origins == ["https://velora.example.com", "https://mentor.example.com"]
    assert config.commission_percent == Decimal("5")
    assert isinstance(config.commission_percent, Decimal)
    assert not config.image_uploads_enabled


def test_settings_and_validation_errors_do_not_display_secrets():
    secret = "synthetic-secret-value"
    config = production(
        database_url=f"postgresql://demo:{secret}@db.example.com/demo", admin_password=secret
    )
    assert secret not in repr(config)
    with pytest.raises(ValidationError) as error:
        production(
            database_url=f"postgresql://demo:{secret}@db.example.com/demo", frontend_origins="*"
        )
    assert secret not in str(error.value)


def test_production_preserves_stronger_tls_and_requires_persistent_upload_configuration():
    config = production(database_url="postgresql://demo:x@db.example.com/demo?sslmode=verify-full")
    assert config.connection_args["sslmode"] == "verify-full"
    assert (
        production(
            database_url="postgresql://demo:x@db.example.com/demo?sslmode=verify-full",
            database_sslmode="require",
        ).connection_args["sslmode"]
        == "verify-full"
    )
    with pytest.raises(ValidationError, match="require TLS"):
        production(database_sslmode="prefer")
    with pytest.raises(ValidationError, match="UPLOAD_DIR"):
        production(uploads_enabled=True)


def test_development_fallback_remains_available():
    config = Settings(
        _env_file=None,
        database_url="sqlite:///local.db",
        frontend_origin="http://127.0.0.1:5173",
        frontend_origins="",
        uploads_enabled=None,
    )
    assert config.image_uploads_enabled
    assert config.connection_args == {"check_same_thread": False}


def test_health_check_covers_a_missing_schema_without_leaking_details():
    from fastapi.testclient import TestClient

    def missing_schema():
        raise ProgrammingError("private SQL", {}, RuntimeError("private driver details"))

    app.dependency_overrides[get_db] = missing_schema
    try:
        with TestClient(app) as client:
            response = client.get("/api/health")
            assert response.status_code == 503
            assert "private" not in response.text
    finally:
        app.dependency_overrides.clear()


def test_disabled_uploads_are_reported_and_enforced_without_writing_files(monkeypatch):
    from fastapi.testclient import TestClient

    from app.security import current_user

    monkeypatch.setattr(settings, "uploads_enabled", False)
    app.dependency_overrides[current_user] = lambda: object()
    try:
        with TestClient(app) as client:
            assert client.get("/api/config").json()["uploads_enabled"] is False
            result = client.post(
                "/api/uploads", files={"file": ("image.png", b"\x89PNG\r\n\x1a\n", "image/png")}
            )
            assert result.status_code == 503
            assert "HTTPS image URL" in result.json()["detail"]
    finally:
        app.dependency_overrides.clear()


def hosted_environment():
    return {
        **os.environ,
        "APP_ENV": "production",
        "DATABASE_URL": "postgresql://demo:synthetic-password@db.example.com/demo",
        "FRONTEND_ORIGINS": "https://velora.example.com,https://mentor.example.com",
        "DATABASE_SSLMODE": "require",
        "UPLOADS_ENABLED": "false",
    }


def test_real_production_middleware_handles_cors_and_capabilities_without_a_database_connection():
    script = """
import json
from fastapi.testclient import TestClient
from app.main import app
with TestClient(app) as client:
    for origin in ['https://velora.example.com', 'https://mentor.example.com']:
        response = client.options('/api/health', headers={'Origin': origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,content-type'})
        assert response.status_code == 200
        assert response.headers['access-control-allow-origin'] == origin
    response = client.options('/api/health', headers={'Origin': 'https://unrelated.example.com', 'Access-Control-Request-Method': 'GET'})
    assert 'access-control-allow-origin' not in response.headers
    assert client.get('/api/config').json() == {'uploads_enabled': False, 'online_payments_enabled': False}
print(json.dumps({'production_cors': True, 'uploads_disabled': True}))
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[2],
        env=hosted_environment(),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, (
        "Production middleware subprocess failed; no credentials are included in this assertion."
    )
    assert json.loads(result.stdout)["production_cors"] is True


def test_initial_migration_generates_postgresql_sql_without_executing_it():
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head", "--sql"],
        cwd=Path(__file__).parents[2],
        env=hosted_environment(),
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, "Offline migration rendering failed."
    assert "CREATE EXTENSION IF NOT EXISTS btree_gist" in result.stdout
    assert "no_booking_overlap" in result.stdout
    assert "synthetic-password" not in result.stdout


def test_hosted_migrations_require_apply_before_prompting_for_credentials(monkeypatch):
    from app import deployment

    monkeypatch.setattr(
        sys, "argv", ["deployment", "migrate", "--frontend-origin", "https://velora.example.com"]
    )
    monkeypatch.setattr(
        deployment, "getpass", lambda _: pytest.fail("Must not request credentials without --apply")
    )
    with pytest.raises(SystemExit) as error:
        deployment.main()
    assert error.value.code == 2


@pytest.mark.parametrize(
    "existing_tables,revisions,confirmation",
    [({"existing_customer_data"}, [], "demo"), (set(), [], "incorrect-name")],
)
def test_hosted_migrations_refuse_unversioned_data_or_incorrect_confirmation(
    monkeypatch, existing_tables, revisions, confirmation
):
    from app import deployment

    class FakeEngine:
        def dispose(self):
            pass

    monkeypatch.setattr(
        sys,
        "argv",
        ["deployment", "migrate", "--apply", "--frontend-origin", "https://velora.example.com"],
    )
    monkeypatch.setattr(
        deployment, "getpass", lambda _: "postgresql://demo:synthetic-password@db.example.com/demo"
    )
    monkeypatch.setattr(deployment, "create_engine", lambda *args, **kwargs: FakeEngine())
    monkeypatch.setattr(
        deployment, "inspect_database", lambda _: ("demo", existing_tables, revisions)
    )
    monkeypatch.setattr("builtins.input", lambda _: confirmation)
    monkeypatch.setattr(
        deployment.subprocess,
        "run",
        lambda *args, **kwargs: pytest.fail("A database mutation must not run"),
    )
    with pytest.raises(SystemExit):
        deployment.main()
