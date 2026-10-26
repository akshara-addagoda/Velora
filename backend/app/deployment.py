"""Explicit hosted-demo database operations. Nothing runs during app startup/builds.

The URL is prompted without echo; it is never written to .env or passed as a command
argument. Mutations additionally require --apply and a typed database-name confirmation.
"""

import argparse
import os
import subprocess
import sys
from getpass import getpass
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import SQLAlchemyError

from .config import Settings


def inspect_database(engine):
    with engine.connect() as connection:
        database = connection.scalar(text("SELECT current_database()"))
        tables = set(inspect(connection).get_table_names())
        revisions = (
            list(connection.scalars(text("SELECT version_num FROM alembic_version")))
            if "alembic_version" in tables
            else []
        )
    return database, tables, revisions


def main():
    parser = argparse.ArgumentParser(
        description="Inspect or initialize an approved hosted demo database"
    )
    parser.add_argument("action", choices=["inspect", "migrate", "seed"])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Permit writes after approval and database-name confirmation",
    )
    parser.add_argument(
        "--frontend-origin", required=True, help="Exact public HTTPS Vercel origin (not a secret)"
    )
    args = parser.parse_args()
    if args.action != "inspect" and not args.apply:
        parser.error("Database changes require prior approval and the explicit --apply option")
    raw_url = getpass("Hosted demo PostgreSQL URL (hidden): ").strip()
    try:
        configuration = Settings(
            _env_file=None,
            app_env="production",
            database_url=raw_url,
            frontend_origins=args.frontend_origin,
            uploads_enabled=False,
        )
        engine = create_engine(
            configuration.sqlalchemy_url,
            connect_args=configuration.connection_args,
            pool_pre_ping=True,
        )
        database, tables, revisions = inspect_database(engine)
    except (ValidationError, ValueError, SQLAlchemyError):
        raise SystemExit(
            "Hosted database validation failed. Check the URL, TLS and frontend origin. No changes were made; connection secrets are not displayed."
        ) from None
    finally:
        if "engine" in locals():
            engine.dispose()
    print(
        f"Connected to database {database}; public tables: {len(tables)}; revision: {', '.join(revisions) or 'not initialized'}"
    )
    if args.action == "inspect":
        print("Read-only inspection complete. No data changed.")
        return
    if any(revision != "001" for revision in revisions):
        raise SystemExit("Unrecognized migration history. Review the database before proceeding.")
    if tables and not revisions:
        raise SystemExit(
            "Existing tables without recognized migration history. Refusing to initialize blindly."
        )
    if args.action == "seed" and revisions != ["001"]:
        raise SystemExit("Run the approved migration before seeding this demo database.")
    confirmation = input("After approval, type the target database name to confirm this write: ")
    if confirmation != database:
        raise SystemExit("Confirmation did not match. No changes were made.")
    environment = {
        **os.environ,
        "APP_ENV": "production",
        "DATABASE_URL": raw_url,
        "FRONTEND_ORIGINS": args.frontend_origin,
        "UPLOADS_ENABLED": "false",
        "ADMIN_EMAIL": "",
        "ADMIN_PASSWORD": "",
    }
    command = (
        [sys.executable, "-m", "alembic", "upgrade", "head"]
        if args.action == "migrate"
        else [sys.executable, "-m", "app.seed"]
    )
    result = subprocess.run(command, cwd=Path(__file__).parents[1], env=environment, check=False)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
